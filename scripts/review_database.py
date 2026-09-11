"""Rollback-only authorization and state-transition checks for record review."""

from uuid import uuid4

from database import connect
from psycopg import errors
from psycopg.types.json import Jsonb


def run(db):
    try:
        user_id, other_user, document_id = uuid4(), uuid4(), uuid4()
        db.execute("insert into auth.users(id,aud,role) values(%s,'authenticated','authenticated'),(%s,'authenticated','authenticated')", (user_id, other_user))
        db.execute("""insert into public.documents(id,user_id,original_filename,display_name,mime_type,file_size,sha256,storage_path,processing_status)
            values(%s,%s,'review.pdf','Synthetic review','application/pdf',100,%s,%s,'needs_review')""",
            (document_id, user_id, "c" * 64, f"{user_id}/{document_id}/original/{uuid4()}.pdf"))
        page_id, block_id = uuid4(), uuid4()
        db.execute("insert into public.document_pages(id,document_id,user_id,page_number,width,height,native_text_used) values(%s,%s,%s,1,612,792,true)", (page_id, document_id, user_id))
        db.execute("insert into public.document_text_blocks(id,document_id,page_id,user_id,block_index,text,source_type) values(%s,%s,%s,%s,0,'Synthetic source','native_pdf')", (block_id, document_id, page_id, user_id))

        records = []
        for kind in ("lab", "medication"):
            record_id = uuid4()
            db.execute("""insert into public.medical_records(id,user_id,document_id,record_type,confidence,source_page_number,source_block_ids,source_text,extraction_method,extraction_version,fingerprint)
                values(%s,%s,%s,%s,0.9,1,%s,'Synthetic source','deterministic','1.0.0',%s)""",
                (record_id, user_id, document_id, kind, [block_id], uuid4().hex + uuid4().hex))
            records.append(record_id)
        db.execute("insert into public.lab_results(medical_record_id,user_id,test_name,original_value,numeric_value,unit) values(%s,%s,'Hemoglobin','13.5',13.5,'g/dL')", (records[0], user_id))
        db.execute("insert into public.medications(medical_record_id,user_id,name,dose,dose_unit) values(%s,%s,'Metformin','500','mg')", (records[1], user_id))

        db.execute("set local role authenticated")
        db.execute("select set_config('request.jwt.claim.sub',%s,true)", (str(other_user),))
        db.execute("savepoint cross_user")
        try:
            db.execute("select public.review_medical_record(%s,%s,'approve',null)", (document_id, records[0]))
            raise AssertionError("Cross-user review succeeded")
        except errors.NoDataFound:
            db.execute("rollback to savepoint cross_user")
        print("PASS cross-user review is denied")

        db.execute("select set_config('request.jwt.claim.sub',%s,true)", (str(user_id),))
        status = db.execute("select public.review_medical_record(%s,%s,'approve',null)", (document_id, records[0])).fetchone()[0]
        assert status == "needs_review"
        original = db.execute("select source_page_number,source_block_ids,source_text from public.medical_records where id=%s", (records[1],)).fetchone()
        correction = {"recordType": "medication", "name": "Metformin", "dose": "750", "dose_unit": "mg", "route": None, "frequency": "twice daily", "duration": None}
        status = db.execute("select public.review_medical_record(%s,%s,'correct',%s)", (document_id, records[1], Jsonb(correction))).fetchone()[0]
        assert status == "completed"
        assert db.execute("select source_page_number,source_block_ids,source_text from public.medical_records where id=%s", (records[1],)).fetchone() == original
        assert db.execute("select review_status from public.medical_records where id=%s", (records[1],)).fetchone() == ("corrected",)
        assert db.execute("select dose,frequency from public.medications where medical_record_id=%s", (records[1],)).fetchone() == ("750", "twice daily")
        print("PASS approve/correct preserve provenance and complete only after all records are reviewed")
    finally:
        db.rollback()
        print("Review database fixture transaction rolled back")


if __name__ == "__main__":
    with connect() as connection:
        run(connection)
