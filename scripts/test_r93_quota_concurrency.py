"""R93 concurrent PostgreSQL fixture test. NEVER against a real database."""
import concurrent.futures
import json
import os
import subprocess
import uuid

DB = "rutacap_r92_synthetic"
BASE = ["psql", "-X", "-qAt", "-h", "127.0.0.1", "-U", "postgres", "-d", DB, "-v", "ON_ERROR_STOP=1"]
CLAIMS = '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated","is_anonymous":true,"session_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}'

def query(sql):
    return subprocess.run(BASE + ["-c", sql], check=True, capture_output=True, text=True, timeout=60).stdout.strip()

def deliver(key):
    # Generated UUID only; fixed fixture principal and content.
    result = query("set role authenticated; select set_config('request.jwt.claims','" + CLAIMS +
                   "',false); select public.rc_deliver_v1('question','q1','" + str(key) + "');")
    return json.loads(result.splitlines()[-1])

def main():
    if os.environ.get("RUTACAP_R93_SYNTHETIC") != "1":
        raise SystemExit("synthetic guard required")
    if query("select current_database()") != DB:
        raise SystemExit("wrong database")
    if query("select count(*) from rc_internal.rc_quota_daily_v1 where user_id='77777777-7777-4777-8777-777777777777'") != "0":
        raise SystemExit("fixture already used")
    # Yesterday's full usage must not affect today's quota. No clock injection.
    query("insert into rc_internal.rc_quota_daily_v1(user_id,madrid_day,questions_used,exams_used) "
          "values('77777777-7777-4777-8777-777777777777',rc_internal.rc_quota_day_v1(now())-1,25,1)")
    keys = [uuid.uuid4() for _ in range(30)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(deliver, keys))
    allowed = [i for i, r in enumerate(results) if r["status"] == "ok"]
    denied = [r for r in results if r["status"] == "quota_exhausted"]
    assert len(allowed) == 25 and len(denied) == 5, "concurrent over/under-count"
    assert all("content" not in r for r in denied)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        repeats = list(pool.map(deliver, [keys[allowed[0]]] * 12))
    assert all(r["status"] == "ok" and r["replayed"] and r["questionsRemaining"] == 0 for r in repeats)
    count = query("select questions_used from rc_internal.rc_quota_daily_v1 where user_id='77777777-7777-4777-8777-777777777777' and madrid_day=rc_internal.rc_quota_day_v1(now())")
    assert count == "25", "replay charged again"
    print("PASS 30 concurrent deliveries, 25 grants, 5 denied; 12 idempotent replays; prior day ignored")

if __name__ == "__main__":
    main()
