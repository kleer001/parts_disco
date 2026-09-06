"""The one way this tool talks to a host, and the one place politeness lives.

Three outcomes, and the middle one is the one that gets mishandled.

A document that is not there (404) is this item's problem: record it, take the next
number. A host answering 429 or 503 is saying *not now* -- come back later, to the
same request. Anything else is a bug worth surfacing.

The two "not now" codes mean different things and both warrant the same move.
429 is rate limiting: RFC 6585 has it as "the user has sent too many requests in a
given amount of time", so it is about what the caller did. 503 is not about the
caller at all -- RFC 9110 calls it "a temporary overload or scheduled maintenance,
which will likely be alleviated after some delay". A 503 is ordinarily a hiccup, and
retrying it after a wait is exactly what it asks for. (Some hosts do serve an
anti-automation block as 503 -- Google's "Sorry..." page is one -- but that is a
vendor convention, not what the status means.)

What both forbid is moving to the *next item*. Skipping ahead is wrong under either
reading: if the host was briefly overloaded, a document that would have arrived on
retry has been abandoned; if the host is shedding the caller specifically, the next
item is the same request again with a different number in it, and the knocks scale
with the length of the list. So a wait-and-retry happens here, on a widening delay,
against the same URL. When a host is still not serving after several of those, the
run stops rather than walking the rest of the list through it.

Nothing here reaches for the clock or the network directly: the transport, the clock
and the sleep are arguments, so the backoff can be tested without waiting and the gap
can be tested without a server.
"""

import random
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

# --- tuning -------------------------------------------------------------------

# Minimum seconds between two requests to the same host.
MIN_GAP = 6.0

# "Not now, come back later." 429 says the caller asked for too much; 503 says the
# server cannot serve it right now. Different reasons, same move: wait, then ask
# again for the same thing.
RETRYABLE_STATUS = frozenset({429, 503})

# How many times to wait and ask again before giving up on the host.
MAX_ATTEMPTS = 4

# Each wait doubles from here, up to the cap. Starting at the gap rather than at a
# second means the first retry already backs off further than normal pacing.
BACKOFF_BASE = MIN_GAP
BACKOFF_CAP = 120.0


class HostUnavailable(Exception):
    """A host is still not serving after several backed-off attempts.

    Deliberately not caught per item: whether the host is overloaded or shedding
    this caller, the next item on the list is not the thing to try next.
    """


class Fetcher:
    """Fetches URLs, holding a per-host gap and waiting out a "not now"."""

    def __init__(self, user_agent, transport=None, sleep=time.sleep,
                 clock=time.monotonic, jitter=None):
        self.user_agent = user_agent
        self._transport = transport or self._urlopen
        self._sleep = sleep
        self._clock = clock
        self._jitter = jitter if jitter is not None else random.random
        self._last = {}

    def get(self, url):
        """The body at url. Raises HostUnavailable if the host will not serve it."""
        host = urlparse(url).netloc
        for attempt in range(MAX_ATTEMPTS):
            self._wait_for_gap(host)
            try:
                return self._transport(url, self.user_agent)
            except urllib.error.HTTPError as error:
                if error.code not in RETRYABLE_STATUS:
                    raise
                # Last attempt: do not sleep on the way out, just stop.
                if attempt == MAX_ATTEMPTS - 1:
                    break
                self._sleep(self._backoff(attempt, error))
        raise HostUnavailable(
            f"{host} still not serving after {MAX_ATTEMPTS} attempts with backoff "
            f"(HTTP {sorted(RETRYABLE_STATUS)}). Stopping rather than taking the "
            f"next item: it is the same request with a different name in it."
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
        """How long to wait before asking the same host for the same thing again."""
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
