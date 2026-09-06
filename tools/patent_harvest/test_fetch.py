"""Tests for the fetcher's pacing and its behaviour when a host says "not now".

The clock, the sleep and the transport are all injected, so these run instantly and
touch no network.
"""

import unittest
import urllib.error

from fetch import Fetcher, HostUnavailable, MAX_ATTEMPTS, MIN_GAP


class FakeClock:
    """A clock that only moves when something sleeps."""

    def __init__(self):
        self.now = 0.0
        self.slept = []

    def sleep(self, seconds):
        self.slept.append(seconds)
        self.now += seconds

    def __call__(self):
        return self.now


def http_error(code, retry_after=None):
    headers = {"Retry-After": retry_after} if retry_after is not None else {}
    return urllib.error.HTTPError("http://host/x", code, "not now", headers, None)


def fetcher(clock, responses):
    """A fetcher whose transport returns or raises the given responses in order."""
    queue = list(responses)

    def transport(url, user_agent):
        item = queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    return Fetcher("test-agent", transport=transport, sleep=clock.sleep,
                   clock=clock, jitter=lambda: 0.0)


class Pacing(unittest.TestCase):
    def test_first_request_to_a_host_does_not_wait(self):
        clock = FakeClock()
        fetcher(clock, [b"body"]).get("http://a.example/one")
        self.assertEqual(clock.slept, [])

    def test_second_request_to_the_same_host_waits_the_gap(self):
        clock = FakeClock()
        f = fetcher(clock, [b"one", b"two"])
        f.get("http://a.example/one")
        f.get("http://a.example/two")
        self.assertEqual(clock.slept, [MIN_GAP])

    def test_a_different_host_is_not_made_to_wait(self):
        clock = FakeClock()
        f = fetcher(clock, [b"one", b"two"])
        f.get("http://a.example/one")
        f.get("http://b.example/two")
        self.assertEqual(clock.slept, [])


class NotNow(unittest.TestCase):
    def test_a_busy_host_is_waited_out_and_the_body_returned(self):
        clock = FakeClock()
        body = fetcher(clock, [http_error(503), b"body"]).get("http://a.example/x")
        self.assertEqual(body, b"body")
        self.assertTrue(clock.slept, "should have backed off before retrying")

    def test_a_host_still_not_serving_after_several_tries_ends_the_run(self):
        clock = FakeClock()
        f = fetcher(clock, [http_error(503)] * MAX_ATTEMPTS)
        with self.assertRaises(HostUnavailable):
            f.get("http://a.example/x")

    def test_the_backoff_widens_between_attempts(self):
        clock = FakeClock()
        f = fetcher(clock, [http_error(429)] * MAX_ATTEMPTS)
        with self.assertRaises(HostUnavailable):
            f.get("http://a.example/x")
        backoffs = [s for s in clock.slept if s > MIN_GAP]
        self.assertEqual(backoffs, sorted(backoffs))
        self.assertTrue(backoffs, "a busy host should be waited out, not retried flat")

    def test_the_server_is_obeyed_when_it_says_how_long_to_wait(self):
        clock = FakeClock()
        f = fetcher(clock, [http_error(503, retry_after="45"), b"body"])
        f.get("http://a.example/x")
        self.assertIn(45.0, clock.slept)

    def test_a_retry_after_date_falls_through_to_the_computed_backoff(self):
        clock = FakeClock()
        f = fetcher(clock, [http_error(503, retry_after="Wed, 21 Oct 2026 07:28:00 GMT"),
                            b"body"])
        f.get("http://a.example/x")
        self.assertTrue(clock.slept)

    def test_a_missing_document_is_not_waited_out(self):
        # 404 is this item's problem, and waiting will not change the answer. It
        # must reach the caller as itself so the next patent is still tried.
        clock = FakeClock()
        f = fetcher(clock, [http_error(404)])
        with self.assertRaises(urllib.error.HTTPError) as caught:
            f.get("http://a.example/x")
        self.assertEqual(caught.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
