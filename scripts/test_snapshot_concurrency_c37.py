#!/usr/bin/env python3
"""C37 disposable PostgreSQL 17 multiconnection validation. NO live/cloud access."""
import os, threading, time, uuid
import psycopg

URL=os.getenv('C37_DATABASE_URL','postgresql://postgres:c37-disposable-only@127.0.0.1:5432/rutacap_c37_disposable')
if not URL.startswith('postgresql://postgres:') or '@127.0.0.1:5432/rutacap_c37_disposable' not in URL:
    raise SystemExit('Refusing non-disposable C37 database')
A='00000000-0000-4000-8000-000000000001'
B='00000000-0000-4000-8000-000000000002'
passed=0
def db():
    c=psycopg.connect(URL,autocommit=True,connect_timeout=5)
    c.execute("SET statement_timeout='8s'")
    c.execute("SET lock_timeout='4s'")
    return c
def scalar(c, sql, args=()):
    return c.execute(sql,args).fetchone()[0]
def ok(name, condition, info=''):
    global passed
    assert condition, f'{name}: {info}'
    passed+=1
    print(f'PASS {passed:02d} {name} {info}',flush=True)
def err(fun, marker):
    try:fun()
    except Exception as e:
        if marker not in str(e):raise AssertionError(f'wanted {marker}, received {e}')
        return True
    raise AssertionError(f'expected {marker}, no error')
def reset():
    with db() as c:
        c.execute("DELETE FROM public.rc_c34_fixture_snapshots")
        c.execute("DELETE FROM public.rc_progress_events WHERE event_id='fixture-c35-a-e3'")
def begin(c,owner=A,snap=None,key='key'):
    snap=snap or str(uuid.uuid4())
    return scalar(c,'SELECT public.rc_c35_fixture_begin(%s::uuid,%s::uuid,%s)',(owner,snap,key))
def page(c,owner,snap,stream='events',after=0,limit=1):
    return scalar(c,'SELECT public.rc_c37_fixture_page(%s::uuid,%s::uuid,%s,%s,%s)',(owner,snap,stream,after,limit))
def manifest_count(c,owner=A):
    return scalar(c,"SELECT count(*) FROM public.rc_c34_fixture_snapshots WHERE user_id=%s AND expires_at>clock_timestamp()",(owner,))

def isolation_and_quota():
    reset()
    with db() as c:
        for isolation in ('REPEATABLE READ','SERIALIZABLE'):
            c.execute(f'BEGIN ISOLATION LEVEL {isolation}')
            ok(f'{isolation} rejected fail-closed',err(lambda:begin(c),'C37_ISOLATION_REQUIRED'))
            c.execute('ROLLBACK')
        ok('no manifest from rejected isolation',manifest_count(c)==0)
        begin(c,key='seed')
    started=threading.Event(); release=threading.Event(); result={}
    def t1():
        with db() as c:
            c.execute('BEGIN ISOLATION LEVEL READ COMMITTED')
            try:
                result['one']=begin(c,key='one')
                started.set()
                assert release.wait(5)
                c.execute('COMMIT')
            except BaseException as e:
                result['one_error']=str(e);c.execute('ROLLBACK');started.set()
    def t2():
        assert started.wait(5)
        with db() as c:
            c.execute('BEGIN ISOLATION LEVEL READ COMMITTED')
            try:result['two']=begin(c,key='two');c.execute('COMMIT')
            except Exception as e:result['two_error']=str(e);c.execute('ROLLBACK')
    a=threading.Thread(target=t1,daemon=True);b=threading.Thread(target=t2,daemon=True)
    a.start();b.start();assert started.wait(5);time.sleep(.3);release.set()
    a.join(8);b.join(8)
    with db() as c:
        ok('RC concurrent quota 2/2',not a.is_alive() and not b.is_alive() and manifest_count(c)==2 and result.get('one')=='created' and 'ACTIVE_QUOTA' in result.get('two_error',''),str(result))
        ok('no failed quota partial rows',scalar(c,"SELECT count(*) FROM public.rc_c34_fixture_snapshots WHERE checkpoint='two'")==0)

def source_and_rollback():
    reset()
    snap=str(uuid.uuid4())
    with db() as c:
        c.execute('BEGIN')
        ok('rollback materialization created',begin(c,snap=snap)=='created')
        c.execute('ROLLBACK')
        ok('rollback removes manifest and pages',scalar(c,'SELECT count(*) FROM public.rc_c34_fixture_snapshots WHERE snapshot_id=%s',(snap,))==0 and scalar(c,'SELECT count(*) FROM public.rc_c34_fixture_snapshot_rows WHERE snapshot_id=%s',(snap,))==0)
        snap2=str(uuid.uuid4()); begin(c,snap=snap2)
        original=page(c,A,snap2,'events',0,10)
        c.execute("""INSERT INTO public.rc_progress_events(user_id,event_id,question_id,payload,occurred_at)
          VALUES (%s,'fixture-c35-a-e3','c35-a-q3',
          '{"eventId":"fixture-c35-a-e3","questionId":"c35-a-q3","questionnaireId":"cap","deviceId":"synthetic","clock":3,"occurredAt":1763500000003,"kind":"answer","answer":"C","correct":false}',now())""",(A,))
        ok('materialized page unchanged on source growth',page(c,A,snap2,'events',0,10)==original)
        ok('growth beyond row quota rejected',err(lambda:begin(c,key='over-quota'),'ROW_QUOTA'))
        ok('over-quota left no manifest',scalar(c,"SELECT count(*) FROM public.rc_c34_fixture_snapshots WHERE checkpoint='over-quota'")==0)
        c.execute("DELETE FROM public.rc_progress_events WHERE event_id='fixture-c35-a-e3'")

def page_cleanup_and_clock():
    reset()
    snap=str(uuid.uuid4())
    with db() as c:begin(c,snap=snap,key='paged')
    fetched=threading.Event(); expired=threading.Event(); result={}
    def reader():
        with db() as c:
            c.execute('BEGIN ISOLATION LEVEL READ COMMITTED')
            try:
                first=page(c,A,snap,'events',0,1)
                result['first']=first
                fetched.set()
                assert expired.wait(5)
                # Transaction now() still equals time of BEGIN: wall-clock expiry check must override it.
                result['frozen_now']=scalar(c,'SELECT now() < clock_timestamp()')
                result['second_rejected']=err(lambda:page(c,A,snap,'events',1,1),'SNAPSHOT_EXPIRED')
                c.execute('ROLLBACK')
            except BaseException as e:
                result['error']=str(e);c.execute('ROLLBACK');fetched.set()
    t=threading.Thread(target=reader,daemon=True);t.start();assert fetched.wait(5)
    with db() as c:
        ok('first page has one row',len(result['first']['rows'])==1)
        c.execute("UPDATE public.rc_c34_fixture_snapshots SET expires_at=clock_timestamp()-interval '1 second' WHERE snapshot_id=%s",(snap,))
        removed=scalar(c,'SELECT public.rc_c35_fixture_cleanup()')
        ok('cleanup removed expired while reader paused',removed==1)
    expired.set();t.join(8)
    ok('page2 rejects expiry in same long transaction',not t.is_alive() and result.get('second_rejected') and result.get('frozen_now') and not result.get('error'),str(result))
    with db() as c:
        ok('no orphan rows after page/cleanup',scalar(c,'SELECT count(*) FROM public.rc_c34_fixture_snapshot_rows WHERE snapshot_id=%s',(snap,))==0)
        ok('new page request after cleanup rejects',err(lambda:page(c,A,snap),'SNAPSHOT_EXPIRED'))

def timeout_and_cross_owner():
    reset()
    lock=threading.Event();release=threading.Event();out={}
    def holder():
        with db() as c:
            c.execute('BEGIN')
            c.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,35001))",(A,))
            lock.set()
            release.wait(5);c.execute('COMMIT')
    t=threading.Thread(target=holder,daemon=True);t.start();assert lock.wait(5)
    with db() as c:
        c.execute("SET lock_timeout='180ms'")
        ok('same-owner advisory lock timeout',err(lambda:begin(c,A,key='timeout'),'lock timeout'))
        ok('different owner not blocked',begin(c,B,key='independent')=='created')
        ok('timeout leaves no partial manifest',scalar(c,"SELECT count(*) FROM public.rc_c34_fixture_snapshots WHERE checkpoint='timeout'")==0)
    release.set();t.join(8)
    ok('lock holder exits',not t.is_alive())
    with db() as c:
        snap=str(uuid.uuid4());begin(c,A,snap,'private')
        c.execute('SET ROLE authenticated')
        c.execute("SELECT set_config('request.jwt.claim.sub',%s,false)",(B,))
        c.execute("""SELECT set_config('request.jwt.claims','{"is_anonymous":false}',false)""")
        ok('simulated JWT B sees no A pages',scalar(c,'SELECT count(*) FROM public.rc_c34_fixture_snapshot_rows WHERE snapshot_id=%s',(snap,))==0)
        ok('authenticated cannot call page fixture',err(lambda:page(c,A,snap),'permission denied'))
        c.execute('RESET ROLE')
        ok('bad stream rejected',err(lambda:page(c,A,snap,'invalid'),'BAD_PAGE_REQUEST'))
        ok('oversized page rejected',err(lambda:page(c,A,snap,'events',0,51),'BAD_PAGE_REQUEST'))

if __name__=='__main__':
    isolation_and_quota()
    source_and_rollback()
    page_cleanup_and_clock()
    timeout_and_cross_owner()
    print(f'C37 PASS: {passed} assertions, PostgreSQL 17 disposable; cloud remains OFF.',flush=True)
