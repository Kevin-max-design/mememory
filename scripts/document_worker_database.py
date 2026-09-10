"""Rollback-only integration checks for the document worker database functions."""

from uuid import uuid4

from database import connect
from psycopg import errors
from psycopg.types.json import Jsonb


def insert_job(db):
    user_id, document_id, job_id = uuid4(), uuid4(), uuid4()
    db.execute(
        "insert into auth.users(id,aud,role) values(%s,'authenticated','authenticated')",
        (user_id,),
    )
    storage_path = f"{user_id}/{document_id}/original/{uuid4()}.pdf"
    db.execute(
        """insert into public.documents(
             id,user_id,original_filename,display_name,mime_type,file_size,sha256,
             storage_path,processing_status)
           values(%s,%s,'synthetic.pdf','Synthetic worker fixture','application/pdf',
                  100,%s,%s,'queued')""",
        (document_id, user_id, "a" * 64, storage_path),
    )
    db.execute(
        """insert into public.processing_jobs(id,user_id,document_id,job_type,status)
           values(%s,%s,%s,'analyze','queued')""",
        (job_id, user_id, document_id),
    )
    return user_id, document_id, job_id


def claim(db, job_id, timeout=900):
    return db.execute(
        "select * from public.claim_document_processing_job(%s,%s)",
        (timeout, job_id),
    ).fetchone()


def run(db):
    try:
        user_id, document_id, job_id = insert_job(db)

        db.execute("set local role authenticated")
        db.execute("select set_config('request.jwt.claim.sub',%s,true)", (str(user_id),))
        try:
            claim(db, job_id)
            raise AssertionError("Authenticated role claimed an internal job")
        except errors.InsufficientPrivilege:
            pass
        finally:
            db.execute("reset role")
        print("PASS worker functions reject authenticated clients")

        claimed = claim(db, job_id)
        assert claimed is not None and claimed[0] == job_id and claimed[1] == document_id
        lock_token = claimed[3]
        assert claimed[4] == 1 and claim(db, job_id) is None
        assert not db.execute(
            "select public.renew_document_processing_job(%s,%s)",
            (job_id, uuid4()),
        ).fetchone()[0]
        assert db.execute(
            "select public.renew_document_processing_job(%s,%s)",
            (job_id, lock_token),
        ).fetchone()[0]
        print("PASS claim is exclusive and lock renewal requires its token")

        pages = [
            {
                "page_number": 1,
                "width": 612,
                "height": 792,
                "rotation": 0,
                "skew_angle": 0,
                "native_text_used": True,
                "blocks": [
                    {
                        "block_index": 0,
                        "text": "Synthetic worker source text.",
                        "confidence": None,
                        "bbox": {"x0": 10, "y0": 20, "x1": 200, "y1": 40},
                        "source_type": "native_pdf",
                    }
                ],
            }
        ]
        arguments = (job_id, lock_token, Jsonb(pages), None, None)
        assert db.execute(
            "select public.complete_document_processing_job(%s,%s,%s,%s,%s)",
            arguments,
        ).fetchone()[0]
        assert db.execute(
            "select public.complete_document_processing_job(%s,%s,%s,%s,%s)",
            arguments,
        ).fetchone()[0]
        assert db.execute(
            "select count(*) from public.document_pages where document_id=%s",
            (document_id,),
        ).fetchone() == (1,)
        assert db.execute(
            "select count(*) from public.document_text_blocks where document_id=%s",
            (document_id,),
        ).fetchone() == (1,)
        assert db.execute(
            "select processing_status from public.documents where id=%s", (document_id,)
        ).fetchone() == ("needs_review",)
        assert db.execute(
            "select status from public.processing_jobs where id=%s", (job_id,)
        ).fetchone() == ("completed",)
        print("PASS completion persists once and duplicate completion is idempotent")

        _, retry_document, retry_job = insert_job(db)
        retry_claim = claim(db, retry_job)
        assert retry_claim is not None
        next_status = db.execute(
            "select public.fail_document_processing_job(%s,%s,%s,%s,%s)",
            (retry_job, retry_claim[3], "PROCESSOR_UNAVAILABLE", "Temporary failure.", True),
        ).fetchone()[0]
        assert next_status == "queued"
        second_claim = claim(db, retry_job)
        assert second_claim is not None and second_claim[4] == 2
        next_status = db.execute(
            "select public.fail_document_processing_job(%s,%s,%s,%s,%s)",
            (retry_job, second_claim[3], "UPLOAD_INVALID_FILE", "Invalid file.", False),
        ).fetchone()[0]
        assert next_status == "failed"
        assert db.execute(
            "select processing_status from public.documents where id=%s",
            (retry_document,),
        ).fetchone() == ("failed",)
        print("PASS retryable failures requeue and permanent failures terminate")

        _, _, stale_job = insert_job(db)
        stale_claim = claim(db, stale_job)
        db.execute(
            "update public.processing_jobs set locked_at=now()-interval '20 minutes' where id=%s",
            (stale_job,),
        )
        reclaimed = claim(db, stale_job, timeout=60)
        assert reclaimed is not None and reclaimed[3] != stale_claim[3] and reclaimed[4] == 2
        print("PASS stale claims are safely reclaimed with a new token")
    finally:
        db.rollback()
        print("Worker database fixture transaction rolled back")


if __name__ == "__main__":
    with connect() as connection:
        run(connection)
