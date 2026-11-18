#!/usr/bin/env python3
"""C38 disposable PostgreSQL 17: source race, sealed snapshot, cursor, finish."""
import os,threading,time,uuid
import psycopg

URL=os.getenv('C38_DATABASE_URL','postgresql://postgres:c38-disposable-only@127.0.0.1:5432/rutacap_c38_disposable')
if not URL.startswith('postgresql://postgres:') or '@127.0.0.1:5432/rutacap_c38_disposable' not in URL:
    raise SystemExit('C38 refuses non-disposable database')
A='00000000-0000-4000-8000-000000000001'
B='00000000-0000-4000-8000-000000000002'
checks=0
def db():
    c=psycopg.connect(URL,autocommit=True,connect_timeout=5)
    c.execute("SET statement_timeout='10s'")
    c.execute("SET lock_timeout='5s'")
    return c
def one(c,sql,args=()):return c.execute(sql,args).fetchone()[0]
def ok(name,val,detail=''):
    global checks
    assert val,f'{name}: {detail}'
    checks+=1
    print(f'PASS {checks:02d} {name} {detail}',flush=True)
def fails(f,marker):
    try:f()
    except Exception as e:
        if marker not in str(e):raise AssertionError(f'wanted {marker}; got {e}')
        return True
    raise AssertionError(f'expected {marker}')
def reset():
    with db() as c:
        c.execute('DELETE FROM public.rc_c34_fixture_snapshots')
        c.execute("DELETE FROM public.rc_progress_events WHERE event_id IN ('fixture-c35-a-e3','fixture-c38-late','fixture-c38-after')")
        c.execute("DROP TRIGGER IF EXISTS rc_c38_sleep ON public.rc_c34_fixture_snapshots")
        c.execute("DROP FUNCTION IF EXISTS public.rc_c38_sleep_trigger()")
def begin(c,owner=A,sid=None,key='fixture'):
    return one(c,'SELECT public.rc_c35_fixture_begin(%s::uuid,%s::uuid,%s)',(owner,sid or str(uuid.uuid4()),key))
def page(c,owner,sid,stream='events',after=0,limit=1):
    return one(c,'SELECT public.rc_c37_fixture_page(%s::uuid,%s::uuid,%s,%s,%s)',(owner,sid,stream,after,limit))
def finish(c,owner,sid,digest,count):
    return one(c,'SELECT public.rc_c38_fixture_finish(%s::uuid,%s::uuid,%s,%s)',(owner,sid,digest,count))
def event(c,name):
    c.execute("""INSERT INTO public.rc_progress_events(user_id,event_id,question_id,payload,occurred_at)
    VALUES (%s,%s,%s,jsonb_build_object('eventId',%s,'questionId',%s,'questionnaireId','cap',
    'deviceId','synthetic','clock',3,'occurredAt',1763500000003::bigint,'kind','answer',
    'answer','C','correct',false),clock_timestamp())""",(A,name,name,name,name))

def integrity_and_finish():
    reset()
    sid=str(uuid.uuid4())
    with db() as c:
        ok('create manifest',begin(c,sid=sid,key='gen1')=='created')
        pages=[page(c,A,sid,'events',0,1),page(c,A,sid,'events',1,1),page(c,A,sid,'sessions',0,10)]
        ok('exact materialized generation counts', all(p['rowCount']==3 and p['byteCount']>0 for p in pages))
        ok('immutable digest across pages and streams',len({p['digest'] for p in pages})==1)
        ok('cursor selects distinct ordinal 1 and 2',pages[0]['rows'][0]['ordinal']==1 and pages[1]['rows'][0]['ordinal']==2)
        ok('complete events plus session',sum(len(p['rows']) for p in pages)==3)
        digest=pages[0]['digest']
        ok('wrong digest rejected',fails(lambda:finish(c,A,sid,'0'*32,3),'C38_INTEGRITY_MISMATCH'))
        ok('wrong count rejected',fails(lambda:finish(c,A,sid,digest,2),'C38_INTEGRITY_MISMATCH'))
        ok('finish succeeds',finish(c,A,sid,digest,3)=='finished')
        ok('finish retry idempotent',finish(c,A,sid,digest,3)=='already_finished')
        ok('begin same ID idempotent',begin(c,sid=sid,key='gen1')=='existing')
        ok('begin collision rejected',fails(lambda:begin(c,sid=sid,key='newgen'),'SNAPSHOT_ID_COLLISION'))
        event(c,'fixture-c38-after')
        ok('source growth leaves digest fixed',page(c,A,sid,'events',0,10)['digest']==digest)
        ok('source growth beyond quota rejected',fails(lambda:begin(c,key='overgrowth'),'ROW_QUOTA'))
        c.execute("DELETE FROM public.rc_progress_events WHERE event_id='fixture-c38-after'")
        c.execute('SET ROLE authenticated')
        c.execute("SELECT set_config('request.jwt.claim.sub',%s,false)",(B,))
        c.execute("""SELECT set_config('request.jwt.claims','{"is_anonymous":false}',false)""")
        ok('B cannot read integrity table',fails(lambda:one(c,'SELECT count(*) FROM public.rc_c38_fixture_integrity'),'permission denied'))
        ok('B cannot invoke finish',fails(lambda:finish(c,A,sid,digest,3),'permission denied'))
        c.execute('RESET ROLE')
        c.execute('UPDATE public.rc_c34_fixture_snapshots SET expires_at=clock_timestamp()-interval \'1 second\' WHERE snapshot_id=%s',(sid,))
        ok('expired finish rejects',fails(lambda:finish(c,A,sid,digest,3),'SNAPSHOT_EXPIRED'))
        ok('cleanup cascades integrity',one(c,'SELECT public.rc_c35_fixture_cleanup()')==1 and one(c,'SELECT count(*) FROM public.rc_c38_fixture_integrity WHERE snapshot_id=%s',(sid,))==0)

def staged_source_race():
    reset()
    # BEFORE INSERT on manifest is executed AFTER preflight quota SELECT
    # and BEFORE source SELECT used to materialize rows.
    with db() as c:
        c.execute("""CREATE FUNCTION public.rc_c38_sleep_trigger() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(1.1); RETURN NEW; END $$""")
        c.execute("""CREATE TRIGGER rc_c38_sleep BEFORE INSERT ON public.rc_c34_fixture_snapshots
        FOR EACH ROW EXECUTE FUNCTION public.rc_c38_sleep_trigger()""")
    sid=str(uuid.uuid4());out={}
    def creator():
        with db() as c:
            try:out['result']=begin(c,sid=sid,key='race')
            except Exception as e:out['error']=str(e)
    t=threading.Thread(target=creator,daemon=True);t.start()
    # Verify the creator is actually blocked inside trigger before inserting
    # source growth: pg_stat_activity waits on pg_sleep (Timeout).
    ready=False
    for _ in range(60):
        with db() as c:
            activity=c.execute("""SELECT state,wait_event FROM pg_stat_activity
            WHERE query LIKE 'SELECT public.rc_c35_fixture_begin(%'
            AND pid<>pg_backend_pid()""").fetchall()
        if any(wait=='PgSleep' for _,wait in activity):
            ready=True;break
        time.sleep(.025)
    ok('source race injection occurs inside manifest delay',ready,str(activity))
    with db() as c:event(c,'fixture-c38-late')
    t.join(9)
    ok('creator finished after source race',not t.is_alive(),str(out))
    ok('post-materialization quota aborts growth race','C38_MATERIALIZED_ROW_QUOTA' in out.get('error',''),str(out))
    with db() as c:
        ok('failed race leaves neither manifest nor integrity',one(c,'SELECT count(*) FROM public.rc_c34_fixture_snapshots WHERE snapshot_id=%s',(sid,))==0 and one(c,'SELECT count(*) FROM public.rc_c38_fixture_integrity WHERE snapshot_id=%s',(sid,))==0)
        ok('failed race leaves no copied pages',one(c,'SELECT count(*) FROM public.rc_c34_fixture_snapshot_rows WHERE snapshot_id=%s',(sid,))==0)
        c.execute("DELETE FROM public.rc_progress_events WHERE event_id='fixture-c38-late'")
        c.execute("DROP TRIGGER rc_c38_sleep ON public.rc_c34_fixture_snapshots")
        c.execute("DROP FUNCTION public.rc_c38_sleep_trigger()")

def failure_and_cross_owner():
    reset()
    with db() as c:
        sid=str(uuid.uuid4())
        c.execute('BEGIN')
        ok('begin inside transaction',begin(c,sid=sid)=='created')
        c.execute('ROLLBACK')
        ok('rollback strips integrity and manifest',one(c,'SELECT count(*) FROM public.rc_c38_fixture_integrity WHERE snapshot_id=%s',(sid,))==0 and one(c,'SELECT count(*) FROM public.rc_c34_fixture_snapshots WHERE snapshot_id=%s',(sid,))==0)
        sidA=str(uuid.uuid4());sidB=str(uuid.uuid4())
        begin(c,A,sidA,'a');begin(c,B,sidB,'b')
        ok('owner digest isolation',page(c,A,sidA)['digest']!=page(c,B,sidB)['digest'])
        ok('owner B cannot finish A with B snapshot ID',fails(lambda:finish(c,B,sidA,page(c,A,sidA)['digest'],3),'SNAPSHOT_EXPIRED'))
        c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ')
        ok('RR begin remains blocked',fails(lambda:begin(c),'C37_ISOLATION_REQUIRED'))
        c.execute('ROLLBACK')

if __name__=='__main__':
    integrity_and_finish()
    staged_source_race()
    failure_and_cross_owner()
    print(f'C38 PASS: {checks} checks on disposable PostgreSQL; cloud OFF',flush=True)
