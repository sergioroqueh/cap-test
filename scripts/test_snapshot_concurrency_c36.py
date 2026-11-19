#!/usr/bin/env python3
"""C36: real independent PostgreSQL sessions; disposable CI database only.
Never configure this script with real Supabase credentials.
"""
import os
import threading
import time
import uuid

import psycopg

DB = os.environ.get("C36_DATABASE_URL", "postgresql://postgres:c36-fixture-no-live@127.0.0.1:5432/rutacap_c36_disposable")
if "rutacap_c36_disposable" not in DB or "127.0.0.1" not in DB:
    raise SystemExit("C36 refuses any database other than disposable localhost fixture")

A = "00000000-0000-4000-8000-000000000001"
B = "00000000-0000-4000-8000-000000000002"
results = []

def connect():
    c = psycopg.connect(DB, autocommit=True, connect_timeout=5)
    c.execute("SET statement_timeout='8s'")
    c.execute("SET lock_timeout='5s'")
    return c

def run(c, sql, args=()):
    return c.execute(sql, args).fetchone()

def reset(owner=A):
    with connect() as c:
        c.execute("DELETE FROM public.rc_c34_fixture_snapshots WHERE user_id=%s", (owner,))
        # C35 leaves A above row quota; remove only the C35-added synthetic event.
        if owner == A:
            c.execute("DELETE FROM public.rc_progress_events WHERE user_id=%s AND event_id='fixture-c35-a-e3'", (A,))

def begin(c, owner, snap, checkpoint="test"):
    return run(c, "SELECT public.rc_c35_fixture_begin(%s::uuid,%s::uuid,%s)", (owner, snap, checkpoint))[0]

def count(c, owner=A):
    return run(c, "SELECT count(*) FROM public.rc_c34_fixture_snapshots WHERE user_id=%s AND expires_at>now()", (owner,))[0]

def check(name, condition, detail=""):
    if not condition:
        raise AssertionError(f"{name}: {detail}")
    print(f"PASS {name} {detail}", flush=True)
    results.append(name)

def error_is(exc, marker):
    return marker in str(exc)

def concurrency(isolation, expect_overshoot):
    reset(A)
    with connect() as c:
        begin(c, A, str(uuid.uuid4()), "seed")
    prepared = threading.Event()
    start_first = threading.Event()
    first_created = threading.Event()
    release_first = threading.Event()
    second_started = threading.Event()
    output = {}

    def first():
        with connect() as c:
            c.execute(f"BEGIN ISOLATION LEVEL {isolation}")
            try:
                start_first.wait(5)
                output["first"] = begin(c, A, str(uuid.uuid4()), "first")
                first_created.set()
                if not release_first.wait(5):
                    raise TimeoutError("first transaction not released")
                c.execute("COMMIT")
            except BaseException as e:
                output["first_error"] = str(e)
                c.execute("ROLLBACK")
                first_created.set()

    def second():
        with connect() as c:
            c.execute(f"BEGIN ISOLATION LEVEL {isolation}")
            # Fix MVCC snapshot BEFORE first creator commits.
            run(c, "SELECT count(*) FROM public.rc_c34_fixture_snapshots WHERE user_id=%s", (A,))
            prepared.set()
            try:
                if not second_started.wait(5):
                    raise TimeoutError("second transaction not started")
                output["second"] = begin(c, A, str(uuid.uuid4()), "second")
                c.execute("COMMIT")
            except Exception as e:
                output["second_error"] = str(e)
                c.execute("ROLLBACK")

    t1 = threading.Thread(target=first, daemon=True)
    t2 = threading.Thread(target=second, daemon=True)
    t2.start()
    assert prepared.wait(5), "second initial snapshot missing"
    t1.start()
    start_first.set()
    assert first_created.wait(5), "first begin did not finish"
    second_started.set()
    time.sleep(.35) # second begin attempts while first holds advisory lock
    release_first.set()
    t1.join(10); t2.join(10)
    check(f"{isolation} threads exit", not t1.is_alive() and not t2.is_alive(), str(output))
    with connect() as c:
        actual = count(c)
    if expect_overshoot:
        # Evidence-only, deliberately reproduce defect on disposable snapshot fixture.
        check("RR stale-snapshot quota reproduction", actual == 3 and output.get("second") == "created", f"active={actual} outcomes={output}")
    else:
        check("RC serialized quota", actual == 2 and error_is(output.get("second_error", ""), "ACTIVE_QUOTA"), f"active={actual} outcomes={output}")

def retry_and_collision():
    reset(A)
    snap = str(uuid.uuid4())
    started = threading.Event()
    release = threading.Event()
    output = []
    def worker(delay):
        with connect() as c:
            c.execute("BEGIN")
            if delay: started.wait(5)
            try:
                outcome = begin(c, A, snap, "same-checkpoint")
                output.append(outcome)
                if not delay:
                    started.set()
                    release.wait(5)
                c.execute("COMMIT")
            except Exception as e:
                output.append(str(e))
                c.execute("ROLLBACK")
    t1=threading.Thread(target=worker,args=(False,),daemon=True)
    t2=threading.Thread(target=worker,args=(True,),daemon=True)
    t1.start(); assert started.wait(5)
    t2.start(); time.sleep(.25); release.set()
    t1.join(10);t2.join(10)
    check("concurrent idempotent begin", sorted(output)==["created","existing"], str(output))
    with connect() as c:
        actual = run(c, "SELECT count(*) FROM public.rc_c34_fixture_snapshots WHERE user_id=%s AND snapshot_id=%s", (A,snap))[0]
        check("single manifest", actual==1)
        try:
            begin(c,A,snap,"different")
        except Exception as e:
            check("collision rejected",error_is(e,"SNAPSHOT_ID_COLLISION"))
        else: raise AssertionError("checkpoint collision accepted")

def expiry_and_rls():
    reset(A); reset(B)
    with connect() as c:
        snapA=str(uuid.uuid4()); snapB=str(uuid.uuid4())
        begin(c,A,snapA,"a")
        begin(c,B,snapB,"b")
        # Simulated roles and claims only. NOT JWT signature verification.
        c.execute("SET ROLE authenticated")
        c.execute("SELECT set_config('request.jwt.claim.sub',%s,false)",(B,))
        c.execute("SELECT set_config('request.jwt.claims','{\"is_anonymous\":false}',false)")
        a_visible=run(c,"SELECT count(*) FROM public.rc_c34_fixture_snapshots WHERE snapshot_id=%s",(snapA,))[0]
        b_visible=run(c,"SELECT count(*) FROM public.rc_c34_fixture_snapshots WHERE snapshot_id=%s",(snapB,))[0]
        check("JWT B cannot see A",a_visible==0 and b_visible==1)
        try: run(c,"SELECT public.rc_c35_fixture_cleanup()")
        except psycopg.errors.InsufficientPrivilege: check("web role cannot cleanup",True)
        else: raise AssertionError("web role invoked cleanup")
        c.execute("RESET ROLE")
        # Simulate page one, expiry before later request, cleanup cascade.
        c.execute("UPDATE public.rc_c34_fixture_snapshots SET expires_at=now()-interval '1 second' WHERE snapshot_id=%s",(snapA,))
        c.execute("SET ROLE authenticated")
        c.execute("SELECT set_config('request.jwt.claim.sub',%s,false)",(A,))
        c.execute("SELECT set_config('request.jwt.claims','{\"is_anonymous\":false}',false)")
        pages=run(c,"SELECT count(*) FROM public.rc_c34_fixture_snapshot_rows WHERE snapshot_id=%s",(snapA,))[0]
        check("expired pages invisible",pages==0)
        c.execute("RESET ROLE")
        removed=run(c,"SELECT public.rc_c35_fixture_cleanup()")[0]
        orphans=run(c,"SELECT count(*) FROM public.rc_c34_fixture_snapshot_rows WHERE snapshot_id=%s",(snapA,))[0]
        check("cleanup expiry cascade",removed==1 and orphans==0)

if __name__=="__main__":
    concurrency("REPEATABLE READ", expect_overshoot=True)
    concurrency("READ COMMITTED", expect_overshoot=False)
    retry_and_collision()
    expiry_and_rls()
    print(f"C36 disposable multi-session tests PASS ({len(results)} assertions); RR vulnerability reproduced, RC candidate validated.",flush=True)
