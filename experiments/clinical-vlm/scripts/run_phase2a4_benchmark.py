"""One-shot, local-only, checkpointed Phase 2A.4 VLM benchmark runner."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import platform
import sys
from pathlib import Path
from time import perf_counter

os.environ.update(
    {
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
        "HF_DATASETS_OFFLINE": "1",
        "HF_HUB_DISABLE_TELEMETRY": "1",
        "DO_NOT_TRACK": "1",
        "TOKENIZERS_PARALLELISM": "false",
    }
)


def deny_network(event: str, args: tuple[object, ...]) -> None:
    if event == "socket.connect":
        raise RuntimeError("NETWORK_DISABLED")


sys.addaudithook(deny_network)

REPO = Path("/Users/aremkevin/Downloads/untitled folder 4")
EXPERIMENT = REPO / "experiments/clinical-vlm"
MODEL = Path.home() / "Library/Caches/medmemory-vlm/Qwen2.5-VL-7B-Instruct-4bit"
MODEL_ID = "mlx-community/Qwen2.5-VL-7B-Instruct-4bit"
MODEL_REVISION = "fdcc572e8b05ba9daeaf71be8c9e4267c826ff9b"
PROMPT_PATH = EXPERIMENT / "prompts/extract_v2.txt"

sys.path.insert(0, str(EXPERIMENT / "src"))

from clinical_vlm.vlm_schema import (  # noqa: E402
    VLM_CONTRACT_VERSION,
    VLM_PROMPT_VERSION,
    VLMExtraction,
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_json(value: object) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def atomic_json(path: Path, value: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    temporary.replace(path)


def result_is_reusable(
    path: Path,
    *,
    document_id: str,
    image_sha256: str,
    prompt_sha256: str,
    schema_sha256: str,
) -> bool:
    if not path.is_file():
        return False
    try:
        value = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        raise RuntimeError("EXISTING_RESULT_UNREADABLE")
    expected = {
        "document_id": document_id,
        "image_sha256": image_sha256,
        "prompt_sha256": prompt_sha256,
        "schema_sha256": schema_sha256,
        "model_revision": MODEL_REVISION,
        "contract_version": VLM_CONTRACT_VERSION,
        "prompt_version": VLM_PROMPT_VERSION,
    }
    if any(value.get(key) != expected_value for key, expected_value in expected.items()):
        raise RuntimeError("EXISTING_RESULT_IDENTITY_MISMATCH")
    raw = value.get("raw_output")
    if not isinstance(raw, str) or hashlib.sha256(raw.encode()).hexdigest() != value.get("raw_output_sha256"):
        raise RuntimeError("EXISTING_RESULT_HASH_MISMATCH")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--benchmark", type=Path, required=True)
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--expected-manifest-sha256", required=True)
    args = parser.parse_args()

    manifest_path = args.benchmark / "benchmark_manifest.json"
    if sha256_file(manifest_path) != args.expected_manifest_sha256:
        raise RuntimeError("MANIFEST_HASH_MISMATCH")
    if not MODEL.is_dir():
        raise RuntimeError("MODEL_DIRECTORY_MISSING")
    manifest = json.loads(manifest_path.read_text())
    prompt = PROMPT_PATH.read_text()
    prompt_sha256 = sha256_file(PROMPT_PATH)
    schema = VLMExtraction.model_json_schema()
    schema_sha256 = sha256_json(schema)

    args.results.mkdir(parents=True, exist_ok=True)
    outputs_dir = args.results / "outputs"
    outputs_dir.mkdir(exist_ok=True)
    checkpoint_path = args.results / "checkpoint.json"
    run_metadata_path = args.results / "run-metadata.json"

    identity = {
        "manifest_sha256": args.expected_manifest_sha256,
        "model_id": MODEL_ID,
        "model_revision": MODEL_REVISION,
        "contract_version": VLM_CONTRACT_VERSION,
        "prompt_version": VLM_PROMPT_VERSION,
        "prompt_sha256": prompt_sha256,
        "schema_sha256": schema_sha256,
    }
    checkpoint: dict[str, object] = {**identity, "completed": {}}
    if checkpoint_path.is_file():
        checkpoint = json.loads(checkpoint_path.read_text())
        if any(checkpoint.get(key) != value for key, value in identity.items()):
            raise RuntimeError("CHECKPOINT_IDENTITY_MISMATCH")

    completed = checkpoint.setdefault("completed", {})
    assert isinstance(completed, dict)
    documents = manifest["documents"]
    unfinished: list[dict[str, object]] = []
    for item in documents:
        document_id = str(item["document_id"])
        image_path = args.benchmark / "pages" / f"{document_id}.png"
        gold_path = args.benchmark / "gold" / f"{document_id}.json"
        if sha256_file(image_path) != item["image_sha256"]:
            raise RuntimeError("IMAGE_HASH_MISMATCH")
        if sha256_file(gold_path) != item["gold_sha256"]:
            raise RuntimeError("GOLD_HASH_MISMATCH")
        result_path = outputs_dir / f"{document_id}.json"
        if result_is_reusable(
            result_path,
            document_id=document_id,
            image_sha256=str(item["image_sha256"]),
            prompt_sha256=prompt_sha256,
            schema_sha256=schema_sha256,
        ):
            completed[document_id] = {"status": "complete", "result": result_path.name}
        else:
            unfinished.append(item)
    atomic_json(checkpoint_path, checkpoint)

    if not unfinished:
        print(f"completed={len(completed)}/{len(documents)}")
        return 0

    import mlx.core as mx
    from mlx_vlm import generate, load
    from mlx_vlm.prompt_utils import apply_chat_template
    from mlx_vlm.structured import build_json_schema_logits_processor

    load_started = perf_counter()
    model, processor = load(str(MODEL), lazy=False, strict=True)
    model_load_seconds = perf_counter() - load_started
    base_schema_processor = build_json_schema_logits_processor(processor.tokenizer, schema)

    class CompletedGrammarEosAdapter:
        """Force EOS only when LLGuidance has consumed a complete JSON document.

        mlx-vlm 0.7.1 can ask LLGuidance for one more token after the final JSON
        delimiter. LLGuidance reports this exact state as a parser-stopped error
        before mlx-vlm can sample the configured Qwen EOS token. No other parser
        or generation error is intercepted.
        """

        requires_immediate_decode_yield = True

        def __init__(self, wrapped, eos_token_id: int) -> None:
            self.wrapped = wrapped
            self.eos_token_id = eos_token_id

        def clone(self):
            wrapped = self.wrapped.clone() if hasattr(self.wrapped, "clone") else self.wrapped
            return CompletedGrammarEosAdapter(wrapped, self.eos_token_id)

        def reset(self) -> None:
            if hasattr(self.wrapped, "reset"):
                self.wrapped.reset()

        def _force_eos(self, logits):
            allowed = mx.arange(logits.shape[-1]) == self.eos_token_id
            blocked = mx.full(logits.shape, float("-inf"), dtype=logits.dtype)
            return mx.where(allowed, logits, blocked)

        def _call(self, callback, *args):
            try:
                return callback(*args)
            except ValueError as error:
                if "LLGuidance matcher error: parser stopped in consume_token" not in str(error):
                    raise
                return self._force_eos(args[-1])

        def __call__(self, input_ids, logits):
            return self._call(self.wrapped, input_ids, logits)

        def process_last_token(self, last_token, logits):
            callback = getattr(self.wrapped, "process_last_token", None)
            if callback is None:
                return self.__call__(mx.array([last_token]), logits)
            return self._call(callback, last_token, logits)

    eos_token_id = model.config.eos_token_id
    if isinstance(eos_token_id, (list, tuple)):
        eos_token_id = eos_token_id[0]
    schema_processor = CompletedGrammarEosAdapter(base_schema_processor, int(eos_token_id))
    formatted_prompt = apply_chat_template(
        processor,
        model.config,
        prompt,
        num_images=1,
        add_generation_prompt=True,
    )
    atomic_json(
        run_metadata_path,
        {
            **identity,
            "runtime": {
                "python": platform.python_version(),
                "mlx": importlib.metadata.version("mlx"),
                "mlx_vlm": importlib.metadata.version("mlx-vlm"),
            },
            "local_only": True,
            "network_blocked": True,
            "model_load_seconds": model_load_seconds,
            "generation": {"max_tokens": 4096, "temperature": 0.0, "seed": 17},
            "structured_completion_compatibility": "llguidance-final-token-to-configured-eos",
        },
    )

    for item in unfinished:
        document_id = str(item["document_id"])
        image_path = args.benchmark / "pages" / f"{document_id}.png"
        started = perf_counter()
        result = generate(
            model,
            processor,
            formatted_prompt,
            image=[str(image_path)],
            max_tokens=4096,
            temperature=0.0,
            seed=17,
            logits_processors=[schema_processor],
            verbose=False,
        )
        inference_seconds = perf_counter() - started
        raw = result.text.strip()
        result_path = outputs_dir / f"{document_id}.json"
        atomic_json(
            result_path,
            {
                "document_id": document_id,
                "image_sha256": item["image_sha256"],
                "prompt_sha256": prompt_sha256,
                "schema_sha256": schema_sha256,
                "model_revision": MODEL_REVISION,
                "contract_version": VLM_CONTRACT_VERSION,
                "prompt_version": VLM_PROMPT_VERSION,
                "inference_seconds": inference_seconds,
                "output_tokens": result.generation_tokens,
                "peak_mlx_memory_gb": result.peak_memory,
                "raw_output_sha256": hashlib.sha256(raw.encode()).hexdigest(),
                "raw_output": raw,
            },
        )
        completed[document_id] = {"status": "complete", "result": result_path.name}
        atomic_json(checkpoint_path, checkpoint)
        print(f"completed={len(completed)}/{len(documents)} document={document_id}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
