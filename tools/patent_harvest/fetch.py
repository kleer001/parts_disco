"""The one way this tool talks to a host, and the one place politeness lives.

Two failures look alike to a caller and must not be treated alike. A document that
is not there is this item's problem: skip it, take the next one. A host answering
429 or 503 is the *run's* problem -- it is the host saying stop, and the next
request is not a new attempt at a different document, it is the same refusal
knocked on again. Walking a list of items through a refusal is how a slow block
becomes a long one.

So a refusal is retried here, on a widening delay, and if it keeps refusing it
raises HostRefusing, which no per-item handler catches and which ends the run.

Nothing here reaches for the clock or the network directly: the transport, the
clock and the sleep are arguments, so the backoff can be tested without waiting
and the gap can be tested without a server.
"""

import random
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

# --- tuning -------------------------------------------------------------------

# Minimum seconds between two requests to the same host.
MIN_GAP = 6.0

# A host that says 429 or 503 is rate-limiting or shedding load. Both mean stop.
REFUSAL_STATUS = frozenset({429, 503})

# How many times a refusal is waited out before the run gives up on the host.
MAX_ATTEMPTS = 4

# Each wait doubles from here, up to the cap. Starting at the gap rather than at a
# second means the first retry already backs off further than normal pacing.
BACKOFF_BASE = MIN_GAP
BACKOFF_CAP = 120.0


class HostRefusing(Exception):
    """A host is refusing requests. The run stops; retrying items will not help."""


class Fetcher:
    """Fetches URLs, holding a per-host gap and backing off when refused."""

    def __init__(self, user_agent, transport=None, sleep=time.sleep,
                 clock=time.monotonic, jitter=None):
        self.user_agent = user_agent
        self._transport = transport or self._urlopen
        self._sleep = sleep
        self._clock = clock
        self._jitter = jitter if jitter is not None else random.random
        self._last = {}

    def get(self, url):
        """The body at url. Raises HostRefusing if the host will not serve it."""
        host = urlparse(url).netloc
        for attempt in range(MAX_ATTEMPTS):
            self._wait_for_gap(host)
            try:
                return self._transport(url, self.user_agent)
            except urllib.error.HTTPError as error:
                if error.code not in REFUSAL_STATUS:
                    raise
                # Last attempt: do not sleep on the way out, just stop.
                if attempt == MAX_ATTEMPTS - 1:
                    break
                self._sleep(self._backoff(attempt, error))
        raise HostRefusing(
            f"{host} answered {sorted(REFUSAL_STATUS)} to {MAX_ATTEMPTS} attempts. "
            f"Stopping: further requests extend the block rather than get around it."
        )

    def _wait_for_gap(self, host):
        last = self._last.get(host)
        now = self._clock()
        if last is not None:
            waited = now - last
            if waited < MIN_GAP:
                self._sleep(MIN_GAP - waited)
        self._last[host] = self._clock()

    def _backoff(self, attempt, error):
        """How long to wait before trying a refused host again."""
        retry_after = self._retry_after(error)
        if retry_after is not None:
            return retry_after
        # Jittered so a repeated run does not retry in lockstep with the last one.
        return min(BACKOFF_CAP, BACKOFF_BASE * 2 ** attempt) + self._jitter()

    @staticmethod
    def _retry_after(error):
        """The server's own answer, when it gives one in seconds."""
        value = error.headers.get("Retry-After") if error.headers else None
        if value is None:
            return None
        try:
            return max(0.0, float(value))
        except ValueError:
            # Retry-After may also be an HTTP date. Rather than parse one, fall
            # through to the computed backoff, which is never shorter than the gap.
            return None

    def _urlopen(self, url, user_agent):
        request = urllib.request.Request(url, headers={"User-Agent": user_agent})
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.read()
