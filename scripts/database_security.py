"""Cross-user tests against real PostgreSQL roles; all fixture changes roll back."""
from uuid import uuid4

from psycopg import errors

TABLES = ['profiles','documents','document_pages','document_text_blocks','medical_records',
          'diagnoses','medications','lab_results','allergies','procedures','vitals','medical_events',
          'doctor_notes','emergency_profiles','share_links','share_link_documents','processing_jobs','audit_logs']


def expect_denied(db, sql, args=()):
    try:
        with db.transaction():
            result = db.execute(sql, args)
            if result.rowcount != 0:
                raise AssertionError('Unauthorized operation affected rows')
    except (errors.InsufficientPrivilege, errors.CheckViolation, errors.ForeignKeyViolation):
        return


def run(db):
    try:
        a, b, document, page = (uuid4() for _ in range(4))
        for user in [a,b]:
            db.execute("insert into auth.users(id,aud,role) values(%s,'authenticated','authenticated')", (user,))
        path = f'{a}/{document}/original/{uuid4()}.pdf'
        db.execute("""insert into public.documents(id,user_id,original_filename,display_name,mime_type,file_size,sha256,storage_path)
          values(%s,%s,'synthetic.pdf','Synthetic security fixture','application/pdf',100,%s,%s)""", (document,a,'a'*64,path))
        db.execute("""insert into public.document_pages(id,document_id,user_id,page_number,width,height,native_text_used)
          values(%s,%s,%s,1,100,100,true)""", (page,document,a))
        found = db.execute("""select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname=any(%s) and c.relkind='r'""", (TABLES,)).fetchall()
        assert len(found) == len(TABLES) and all(row[1] for row in found)
        print(f'PASS RLS enabled on {len(TABLES)} tables')
        assert db.execute("select public from storage.buckets where id='medical-records'").fetchone() == (False,)
        print('PASS private bucket')

        db.execute("set local role authenticated")
        db.execute("select set_config('request.jwt.claim.sub',%s,true)", (str(a),))
        assert db.execute("select id from public.documents where id=%s", (document,)).fetchone() == (document,)
        assert db.execute("select id from public.document_pages where id=%s", (page,)).fetchone() == (page,)
        print('PASS owner can read document and page')
        db.execute("select set_config('request.jwt.claim.sub',%s,true)", (str(b),))
        assert db.execute("select id from public.documents where id=%s", (document,)).fetchone() is None
        assert db.execute("select id from public.document_pages where id=%s", (page,)).fetchone() is None
        expect_denied(db,"update public.documents set display_name='intrusion' where id=%s", (document,))
        expect_denied(db,"delete from public.documents where id=%s", (document,))
        expect_denied(db,"insert into public.doctor_notes(medical_record_id,user_id,text) values(%s,%s,'synthetic')", (uuid4(),a))
        expect_denied(db,"update public.profiles set full_name='intrusion' where id=%s", (a,))
        print('PASS cross-user select/update/delete/insert denied')
        for table in TABLES:
            if table != 'profiles':
                assert db.execute(f'select count(*) from public.{table} where user_id=%s', (a,)).fetchone() == (0,)
        print('PASS all child tables hide other owner data')
        db.execute("set local role anon")
        db.execute("select set_config('request.jwt.claim.sub','',true)")
        for table in TABLES:
            expect_denied(db,f'select * from public.{table}')
        print('PASS anonymous table access denied, including shares and emergency profiles')
        db.execute("reset role")
        expect_denied(db,"""insert into public.document_pages(document_id,user_id,page_number,width,height,native_text_used)
            values(%s,%s,2,100,100,true)""", (document,b))
        print('PASS composite ownership foreign key rejects mismatched child')
        assert db.execute("select display_name from public.documents where id=%s", (document,)).fetchone() == ('Synthetic security fixture',)
    finally:
        db.rollback()
        print('Security fixture transaction rolled back')
