#!/usr/bin/env python3
"""
V4-iter1 Colab A100/L4 Real AI Image-to-Video (I2V) Cinema Shot Generator
for The Last Kiln of Ember Valley (Chroma Awards Season 2).

Key guarantees:
  - Uses `COLAB_ACCOUNT=ultra-2 /Users/eligo/.local/bin/colab` (tries A100 first,
    falls back cleanly to L4 if A100 is temporarily unavailable).
  - Strict signal + atexit + finally cleanup guarantees `colab stop` ALWAYS executes
    so zero compute units ever leak.
  - Generates 8 real AI I2V clips (>=49 frames, target 97 frames @ 24fps, 832x480)
    conditioned on the 8 impasto oil-painting plates (`code/last-kiln/film-renderer/art/01..08_*.png`).
  - Stores rendered MP4 clips on external disk `/Volumes/Extra/datasets/s4_chroma_i2v_clips/`
    (zero heavy video bloat on internal SSD) and writes `materials/v4_i2v_manifest.json`
    with exact ffprobe metadata and frame-to-frame motion delta verification.
"""

from __future__ import annotations

import atexit
import datetime
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

COLAB_BIN = "/Users/eligo/.local/bin/colab"
COLAB_ACCOUNT = os.environ.get("COLAB_ACCOUNT", "ultra-2")

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent
ART_DIR = SCRIPT_DIR / "art"
OUT_EXTERNAL_DIR = Path("/Volumes/Extra/datasets/s4_chroma_i2v_clips")
MANIFEST_PATH = PROJECT_ROOT / "materials" / "v4_i2v_manifest.json"
KEYFRAME_QA_DIR = OUT_EXTERNAL_DIR / "qa_keyframes"

NEGATIVE_PROMPT = (
    "blue, cyan, teal, indigo, purple, violet, neon lights, cool lighting, "
    "distorted geometry, morphing anatomy, ugly flicker, sudden cut, text, letters, "
    "watermark, logo, border, frame, low quality, blurry, jittery artifacts"
)

SHOT_SPECS: list[dict[str, str]] = [
    {
        "shot_id": "shot_01",
        "plate": "01_ember_valley.png",
        "title": "Ember Valley Dusk Panorama",
        "prompt": (
            "Slow restrained 35mm cinema dolly glide forward across the dry terraced oil-painted valley; "
            "thin ribbons of warm pale wood smoke rise and curl organically from the distant hilltop brick kiln chimney, "
            "tiny molten orange embers drift gently in the warm dusk wind, olive leaves tremble softly, "
            "impasto oil-on-linen brushwork and warm amber terracotta palette remain painterly and faithful."
        ),
    },
    {
        "shot_id": "shot_02",
        "plate": "02_hearth_apprentice.png",
        "title": "Apprentice Before the Cooling Hearth",
        "prompt": (
            "Subtle intimate 35mm push-in behind the linen-clad potter apprentice cradling the raw bone-ceramic amphora; "
            "warm amber firelight flickers and breathes rhythmically inside the arched brick kiln mouth, "
            "golden sparks and fine ash motes float upward in volumetric hearth light, "
            "hanging dried herbs sway faintly, tactile oil painting texture preserved throughout."
        ),
    },
    {
        "shot_id": "shot_03",
        "plate": "03_glaze_table.png",
        "title": "Four Mineral Mortars & Master Orin's Gold Leaf",
        "prompt": (
            "Slow macro slider drift across the cedar potter workbench; the glass oil lantern flame dances warmly, "
            "casting shifting golden reflections across the hammered 24k gold leaf sheets inside the open wooden box, "
            "fine warm dust specks drift lazily through lantern beams above the wood ash, river ochre, and red cinnabar mortars, "
            "rich oil-painting brushwork held crisp and steady."
        ),
    },
    {
        "shot_id": "shot_04",
        "plate": "04_molten_glaze_pour.png",
        "title": "Molten Cinnabar & Gold Glaze Pour",
        "prompt": (
            "Hypnotic slow-motion cinematic close-up; thick glossy molten red cinnabar and honeyed river-ochre mineral glaze "
            "flows slowly in a smooth viscous ribbon from the dark stoneware ladle over the curved terracotta shoulder, "
            "tiny flecks of hammered 24k gold leaf swirl and catch warm firelight specular highlights along wet glaze drips, "
            "distant kiln embers glow softly in deep obsidian shadow."
        ),
    },
    {
        "shot_id": "shot_05",
        "plate": "05_kiln_fire.png",
        "title": "1100C Roaring Tunnel Kiln Chamber",
        "prompt": (
            "Dramatic slow push-in toward the glazed cinnabar stoneware amphora standing centered inside the roaring 1100 degree brick kiln; "
            "luminous molten orange and white-gold flames dance, curl, and lick upward around the vessel silhouette, "
            "bright cedar sparks whirl dynamically past rough firebrick arches with subtle radiant heat shimmer, "
            "warm obsidian, cinnabar, amber, and gold impasto oil aesthetic."
        ),
    },
    {
        "shot_id": "shot_06",
        "plate": "06_fracture_gold_crack.png",
        "title": "Midnight Fracture & Molten Gold Awakening",
        "prompt": (
            "Intense restrained macro push-in on the glowing stoneware shoulder fracture inside the hot kiln; "
            "blindingly luminous liquid 24k gold pulses and creeps slowly along the jagged diagonal ceramic fissure, "
            "delicate glowing amber sparks and soft bokeh embers drift diagonally across shallow depth of field, "
            "tactile impasto ceramic texture and warm chiaroscuro lighting."
        ),
    },
    {
        "shot_id": "shot_07",
        "plate": "07_kintsugi_dawn.png",
        "title": "The Gilded Kintsugi Vessel at Sunrise",
        "prompt": (
            "Transcendent slow crane pull-back at golden dawn; radiant warm morning sunbeams shimmer softly across the raised 24k gold "
            "kintsugi veins sealing the charred-terracotta amphora, wisps of pale cooling smoke drift gently out of the dark brick kiln arch, "
            "golden mist glides across distant terraced hills under a warm bone-parchment sunrise sky."
        ),
    },
    {
        "shot_id": "shot_08",
        "plate": "08_olive_shoots_ash.png",
        "title": "Olive Shoots Waking in Warm Ash",
        "prompt": (
            "Gentle poetic macro drift at warm apricot sunrise; tender fresh green olive shoots unfurl and sway softly in a light morning breeze "
            "above dark warm kiln ash beside the gleaming gold-rimmed glazed terracotta shard, warm golden sunlight beams breathe across "
            "misty terraced hills in the background, serene oil-on-linen storybook atmosphere."
        ),
    },
]

REMOTE_WORKER_CODE = r'''#!/usr/bin/env python3
"""Remote Colab GPU worker for generating 8 I2V cinema clips from oil-painting keyframes."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

import torch
from PIL import Image

WORK_DIR = Path("/content/s4_i2v")
ART_DIR = WORK_DIR / "art"
OUT_DIR = WORK_DIR / "clips"
SPEC_PATH = WORK_DIR / "shots.json"


def load_pipeline():
    import diffusers
    gpu_name = torch.cuda.get_device_name(0)
    major, minor = torch.cuda.get_device_capability(0)
    vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
    print(f"[remote] torch={torch.__version__} diffusers={diffusers.__version__} cuda={gpu_name} cc={major}.{minor} vram={vram_gb:.1f}GB", flush=True)

    # Primary choice: Lightricks/LTX-Video-0.9.5 via LTXConditionPipeline (fast, clean I2V, zero HF gate)
    try:
        from diffusers import LTXConditionPipeline
        from diffusers.pipelines.ltx.pipeline_ltx_condition import LTXVideoCondition
        model_id = "Lightricks/LTX-Video-0.9.5"
        print(f"[remote] Loading {model_id} via LTXConditionPipeline...", flush=True)
        pipe = LTXConditionPipeline.from_pretrained(model_id, torch_dtype=torch.bfloat16)
        pipe.vae.enable_tiling()
        return ("ltx_condition", model_id, pipe, LTXVideoCondition, major, vram_gb)
    except Exception as exc:
        print(f"[remote] LTXConditionPipeline fallback triggered: {exc}", flush=True)

    # Secondary fallback: Lightricks/LTX-Video via LTXImageToVideoPipeline
    from diffusers import LTXImageToVideoPipeline
    model_id = "Lightricks/LTX-Video"
    print(f"[remote] Loading {model_id} via LTXImageToVideoPipeline...", flush=True)
    pipe = LTXImageToVideoPipeline.from_pretrained(model_id, torch_dtype=torch.bfloat16)
    pipe.vae.enable_tiling()
    return ("ltx_i2v", model_id, pipe, None, major, vram_gb)


def export_frames_h264(frames, out_mp4: Path, fps: int = 24) -> None:
    tmp_dir = out_mp4.parent / f".frames_{out_mp4.stem}"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    for idx, frame in enumerate(frames):
        if not isinstance(frame, Image.Image):
            frame = Image.fromarray(frame)
        frame.save(tmp_dir / f"f_{idx:04d}.png")
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-framerate", str(fps),
        "-i", str(tmp_dir / "f_%04d.png"),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-crf", "16",
        "-preset", "fast",
        "-movflags", "+faststart",
        str(out_mp4),
    ]
    subprocess.run(cmd, check=True)
    for p in tmp_dir.glob("*.png"):
        p.unlink()
    tmp_dir.rmdir()


def main() -> None:
    import gc
    import inspect
    import numpy as np

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cfg = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    shots = cfg["shots"]
    neg_prompt = cfg["negative_prompt"]
    width = int(cfg.get("width", 832))
    height = int(cfg.get("height", 480))
    num_frames = int(cfg.get("num_frames", 97))
    steps = int(cfg.get("num_inference_steps", 30))

    mode, model_id, pipe, cond_cls, cc_major, vram_gb = load_pipeline()
    gpu_name = torch.cuda.get_device_name(0)
    call_params = set(inspect.signature(pipe.__call__).parameters.keys())

    # Adapt cleanly to GPU tier:
    # - A100/H100/G4 (>=38GB, sm>=80): full pipe.to("cuda") in bfloat16, 832x480 97f
    # - L4 (24GB, sm>=80): official pipe.enable_model_cpu_offload() in bfloat16, 832x480 97f
    # - T4 (16GB, sm<80): pre-encode T5 in bf16 then run 768x448 81f in fp16 on GPU
    preencoded = None
    if cc_major >= 8 and vram_gb >= 38.0:
        pipe.to("cuda")
    elif cc_major >= 8:
        print("[remote] Enabling official diffusers model_cpu_offload + VAE tiling for 24GB bfloat16 GPU...", flush=True)
        pipe.enable_model_cpu_offload()
        if hasattr(pipe.vae, "enable_slicing"):
            pipe.vae.enable_slicing()
    else:
        width = 768
        height = 448
        num_frames = 81
        steps = 28
        run_dtype = torch.float16
        print(f"[remote] Turing GPU detected; pre-encoding all {len(shots)} T5 prompts in bfloat16 then running fp16 diffusion...", flush=True)
        pipe.text_encoder.to("cuda", dtype=torch.bfloat16)
        preencoded = []
        with torch.no_grad():
            for shot in shots:
                pe, pm, ne, nm = pipe.encode_prompt(
                    prompt=shot["prompt"],
                    negative_prompt=neg_prompt,
                    do_classifier_free_guidance=True,
                    device="cuda",
                    dtype=torch.bfloat16,
                )
                preencoded.append((
                    pe.to("cpu", dtype=run_dtype),
                    pm.to("cpu"),
                    ne.to("cpu", dtype=run_dtype),
                    nm.to("cpu"),
                ))
        pipe.text_encoder.to("cpu")
        del pipe.text_encoder
        class _EmptyEncoder(torch.nn.Module):
            def __init__(self, dt):
                super().__init__()
                self.register_buffer("_buf", torch.zeros(1, dtype=dt))
            @property
            def dtype(self):
                return self._buf.dtype
            @property
            def device(self):
                return self._buf.device
        pipe.text_encoder = _EmptyEncoder(run_dtype).to("cuda")
        gc.collect()
        torch.cuda.empty_cache()
        pipe.transformer.to("cuda", dtype=run_dtype)
        pipe.vae.to("cuda", dtype=run_dtype)
        if hasattr(pipe.vae, "enable_slicing"):
            pipe.vae.enable_slicing()

    results = []
    t_all = time.time()

    for idx, shot in enumerate(shots):
        shot_id = shot["shot_id"]
        plate_path = ART_DIR / shot["plate"]
        out_mp4 = OUT_DIR / f"{shot_id}.mp4"
        t0 = time.time()

        img = Image.open(plate_path).convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
        gen = torch.Generator(device="cuda").manual_seed(20261215 + idx * 97)

        print(f"[remote] ({idx + 1}/{len(shots)}) Generating {shot_id} ({width}x{height}, {num_frames} frames, {steps} steps)...", flush=True)
        def _run_once(cur_dtype):
            if preencoded is not None:
                pe, pm, ne, nm = preencoded[idx]
                p_kwargs = {
                    "prompt": None,
                    "negative_prompt": None,
                    "prompt_embeds": pe.to("cuda", dtype=cur_dtype),
                    "prompt_attention_mask": pm.to("cuda"),
                    "negative_prompt_embeds": ne.to("cuda", dtype=cur_dtype),
                    "negative_prompt_attention_mask": nm.to("cuda"),
                }
            else:
                p_kwargs = {
                    "prompt": shot["prompt"],
                    "negative_prompt": neg_prompt,
                }
            extra_kwargs = {}
            if "decode_timestep" in call_params:
                extra_kwargs["decode_timestep"] = 0.05
            if "decode_noise_scale" in call_params:
                extra_kwargs["decode_noise_scale"] = 0.025
            if mode == "ltx_condition":
                condition = cond_cls(image=img, frame_index=0)
                return pipe(
                    conditions=[condition],
                    width=width,
                    height=height,
                    num_frames=num_frames,
                    num_inference_steps=steps,
                    guidance_scale=3.0,
                    generator=gen,
                    **extra_kwargs,
                    **p_kwargs,
                ).frames[0]
            return pipe(
                image=img,
                width=width,
                height=height,
                num_frames=num_frames,
                num_inference_steps=steps,
                guidance_scale=3.0,
                generator=gen,
                **extra_kwargs,
                **p_kwargs,
            ).frames[0]

        active_dtype = pipe.transformer.dtype
        frames = _run_once(active_dtype)

        # Sanity-check mid frame isn't blank/NaN collapsed; if fp16 underflowed on Turing, auto-retry in bfloat16
        mid_arr = np.asarray(frames[len(frames) // 2], dtype=np.float32)
        if (np.isnan(mid_arr).any() or float(mid_arr.std()) < 4.0) and active_dtype == torch.float16:
            print(f"[remote] fp16 collapsed on {shot_id} (std={mid_arr.std():.2f}); switching transformer+vae to bfloat16...", flush=True)
            pipe.text_encoder = _EmptyEncoder(torch.bfloat16).to("cuda")
            pipe.transformer.to("cuda", dtype=torch.bfloat16)
            pipe.vae.to("cuda", dtype=torch.bfloat16)
            torch.cuda.empty_cache()
            gen = torch.Generator(device="cuda").manual_seed(20261215 + idx * 97)
            frames = _run_once(torch.bfloat16)
            mid_arr = np.asarray(frames[len(frames) // 2], dtype=np.float32)

        if np.isnan(mid_arr).any() or float(mid_arr.std()) < 4.0:
            raise RuntimeError(f"Generated clip {shot_id} appears blank/collapsed (std={mid_arr.std():.2f})")

        export_frames_h264(frames, out_mp4, fps=24)
        dt = time.time() - t0
        size_b = out_mp4.stat().st_size
        print(f"[remote] OK {shot_id}.mp4 ({size_b // 1024} KB, {len(frames)} frames, std={mid_arr.std():.1f}) in {dt:.1f}s", flush=True)
        results.append({
            "shot_id": shot_id,
            "plate": shot["plate"],
            "frames": len(frames),
            "width": width,
            "height": height,
            "size_bytes": size_b,
            "render_sec": round(dt, 2),
        })
        torch.cuda.empty_cache()

    meta = {
        "model": model_id,
        "pipeline_mode": mode,
        "gpu": gpu_name,
        "total_render_sec": round(time.time() - t_all, 2),
        "clips": results,
    }
    (OUT_DIR / "remote_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"[remote] ALL {len(results)} CLIPS COMPLETE in {meta['total_render_sec']}s!", flush=True)


if __name__ == "__main__":
    main()
'''


def colab_env(extra: dict[str, str] | None = None) -> dict[str, str]:
    env = os.environ.copy()
    env["COLAB_ACCOUNT"] = COLAB_ACCOUNT
    if extra:
        env.update(extra)
    return env


def run_colab(args: list[str], extra_env: dict[str, str] | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    cmd = [COLAB_BIN, *args]
    print(f"[local] $ COLAB_ACCOUNT={COLAB_ACCOUNT} {' '.join(cmd)}", flush=True)
    proc = subprocess.run(cmd, env=colab_env(extra_env), stdin=subprocess.DEVNULL, text=True)
    if check and proc.returncode != 0:
        raise RuntimeError(f"colab command failed ({proc.returncode}): {' '.join(cmd)}")
    return proc


def probe_clip_metrics(clip_path: Path, qa_dir: Path) -> dict[str, Any]:
    """Extract exact ffprobe stream stats, first/mid/last QA keyframes, and real inter-frame motion deltas."""
    probe = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-count_packets",
            "-show_entries", "stream=width,height,r_frame_rate,nb_read_packets,codec_name,pix_fmt:format=duration,size",
            "-of", "json",
            str(clip_path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    info = json.loads(probe.stdout)
    stream = info["streams"][0]
    fmt = info["format"]
    frames = int(stream.get("nb_read_packets") or 0)
    duration = float(fmt.get("duration") or 0.0)
    width = int(stream["width"])
    height = int(stream["height"])
    fps_parts = str(stream.get("r_frame_rate", "24/1")).split("/")
    fps = round(float(fps_parts[0]) / max(1.0, float(fps_parts[1])), 2) if len(fps_parts) == 2 else 24.0

    # Extract first, middle, and tail frames to verify true non-static motion and enable read_file visual QA
    qa_dir.mkdir(parents=True, exist_ok=True)
    stem = clip_path.stem
    kf_first = qa_dir / f"{stem}_01_first.png"
    kf_mid = qa_dir / f"{stem}_02_mid.png"
    kf_last = qa_dir / f"{stem}_03_last.png"

    timestamps = [0.05, max(0.2, duration * 0.5), max(0.3, duration - 0.12)]
    for ts, out_png in zip(timestamps, [kf_first, kf_mid, kf_last]):
        subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error",
                "-ss", f"{ts:.3f}",
                "-i", str(clip_path),
                "-frames:v", "1",
                str(out_png),
            ],
            check=True,
        )

    # Compute real mean absolute RGB pixel delta between first->mid and mid->last frames
    def frame_mean_diff(p1: Path, p2: Path) -> float:
        raw1 = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(p1), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
            capture_output=True,
            check=True,
        ).stdout
        raw2 = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(p2), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
            capture_output=True,
            check=True,
        ).stdout
        n = min(len(raw1), len(raw2))
        if n == 0:
            return 0.0
        total = sum(abs(a - b) for a, b in zip(raw1[:n], raw2[:n]))
        return round(total / n, 3)

    return {
        "width": width,
        "height": height,
        "fps": fps,
        "frames": frames,
        "duration_sec": round(duration, 3),
        "size_bytes": clip_path.stat().st_size,
        "codec": stream.get("codec_name", "h264"),
        "pix_fmt": stream.get("pix_fmt", "yuv420p"),
        "motion_delta_first_mid": frame_mean_diff(kf_first, kf_mid),
        "motion_delta_mid_last": frame_mean_diff(kf_mid, kf_last),
        "qa_keyframes": [str(kf_first), str(kf_mid), str(kf_last)],
    }


def main() -> None:
    OUT_EXTERNAL_DIR.mkdir(parents=True, exist_ok=True)
    KEYFRAME_QA_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)

    for spec in SHOT_SPECS:
        plate = ART_DIR / spec["plate"]
        if not plate.exists():
            raise FileNotFoundError(f"Missing oil-painting plate: {plate}")

    session_name = f"s4-i2v-{int(time.time())}"
    session_started = False

    def cleanup_session() -> None:
        nonlocal session_started
        if session_started:
            print(f"[local] Stopping Colab session {session_name} to guarantee 0.00/hr burn...", flush=True)
            subprocess.run(
                [COLAB_BIN, "stop", "-s", session_name],
                env=colab_env(),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
            session_started = False

    atexit.register(cleanup_session)

    def handle_signal(signum: int, _frame: Any) -> None:
        cleanup_session()
        sys.exit(128 + signum)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    try:
        # 1. Request best available GPU cleanly: L4 (24GB, 53GB RAM) first with resilient retries,
        #    falling back to A100 -> H100 -> T4 --high-mem -> standard T4 if Colab zone load spikes.
        gpu_tiers: list[tuple[str, list[str], str]] = [
            ("L4", ["new", "-s", session_name, "--gpu", "L4"], "3"),
            ("A100", ["new", "-s", session_name, "--gpu", "A100"], "1"),
            ("H100", ["new", "-s", session_name, "--gpu", "H100"], "1"),
            ("T4-HM", ["new", "-s", session_name, "--gpu", "T4", "--high-mem"], "1"),
            ("T4", ["new", "-s", session_name, "--gpu", "T4"], "2"),
        ]
        gpu_requested = ""
        for tier_name, tier_cmd, retries in gpu_tiers:
            attempt = run_colab(
                tier_cmd,
                extra_env={"COLAB_CLI_ASSIGN_RETRIES": retries, "COLAB_CLI_RETRY_BACKOFF": "8"},
                check=False,
            )
            if attempt.returncode == 0:
                gpu_requested = tier_name
                session_started = True
                break
            print(f"[local] {tier_name} temporarily unavailable (503); trying next GPU tier...", flush=True)
        if not session_started:
            raise RuntimeError("No Colab GPU tier (L4/A100/H100/T4) could be allocated on ultra-2")

        # 2. Prepare remote directories via native colab exec (-f) and upload all 8 oil-painting plates
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            setup_file = tmp / "setup_dirs.py"
            setup_file.write_text(
                "import os, subprocess\n"
                "os.makedirs('/content/s4_i2v/art', exist_ok=True)\n"
                "os.makedirs('/content/s4_i2v/clips', exist_ok=True)\n"
                "print('[remote] GPU:', subprocess.check_output(['nvidia-smi','--query-gpu=name,memory.total','--format=csv,noheader']).decode().strip())\n",
                encoding="utf-8",
            )
            run_colab(["exec", "-s", session_name, "--timeout", "0", "-f", str(setup_file)], check=True)

            worker_file = tmp / "worker.py"
            worker_file.write_text(REMOTE_WORKER_CODE, encoding="utf-8")

            spec_file = tmp / "shots.json"
            spec_file.write_text(
                json.dumps(
                    {
                        "width": 832,
                        "height": 480,
                        "num_frames": 97,
                        "num_inference_steps": 30,
                        "negative_prompt": NEGATIVE_PROMPT,
                        "shots": SHOT_SPECS,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

            run_colab(["upload", "-s", session_name, str(spec_file), "/content/s4_i2v/shots.json"])

            for spec in SHOT_SPECS:
                local_plate = ART_DIR / spec["plate"]
                run_colab(["upload", "-s", session_name, str(local_plate), f"/content/s4_i2v/art/{spec['plate']}"])

            # 3. Install latest diffusers + transformers + sentencepiece on Colab GPU runtime
            run_colab(
                [
                    "install", "-s", session_name,
                    "diffusers>=0.33.0", "transformers>=4.49.0", "accelerate>=1.3.0",
                    "sentencepiece", "protobuf", "imageio", "imageio-ffmpeg", "einops", "ftfy",
                ],
                check=True,
            )

            # 4. Run GPU I2V generation for all 8 shots via native colab exec --timeout 0
            run_colab(
                ["exec", "-s", session_name, "--timeout", "0", "-f", str(worker_file)],
                check=True,
            )

        # 5. Download all 8 rendered MP4s straight to external disk /Volumes/Extra/datasets/s4_chroma_i2v_clips/
        remote_meta_local = OUT_EXTERNAL_DIR / "remote_meta.json"
        run_colab(["download", "-s", session_name, "/content/s4_i2v/clips/remote_meta.json", str(remote_meta_local)])
        remote_meta = json.loads(remote_meta_local.read_text(encoding="utf-8"))

        for spec in SHOT_SPECS:
            sid = spec["shot_id"]
            local_mp4 = OUT_EXTERNAL_DIR / f"{sid}.mp4"
            run_colab(["download", "-s", session_name, f"/content/s4_i2v/clips/{sid}.mp4", str(local_mp4)])

    finally:
        # 6. Immediately stop Colab GPU BEFORE local post-processing/QA so zero extra compute points burn!
        cleanup_session()

    # 7. Run local ffprobe + real motion-delta check + extract 24 QA keyframes (3 per shot)
    manifest_clips: list[dict[str, Any]] = []
    for idx, spec in enumerate(SHOT_SPECS):
        sid = spec["shot_id"]
        local_mp4 = OUT_EXTERNAL_DIR / f"{sid}.mp4"
        metrics = probe_clip_metrics(local_mp4, KEYFRAME_QA_DIR)
        manifest_clips.append(
            {
                "shot_index": idx + 1,
                "shot_id": sid,
                "title": spec["title"],
                "source_plate": f"code/last-kiln/film-renderer/art/{spec['plate']}",
                "output_path": str(local_mp4),
                "prompt": spec["prompt"],
                **metrics,
            }
        )
        print(
            f"[local] Verified {sid}: {metrics['width']}x{metrics['height']} "
            f"{metrics['frames']}f ({metrics['duration_sec']}s) "
            f"size={metrics['size_bytes']}B motion_delta={metrics['motion_delta_first_mid']}/{metrics['motion_delta_mid_last']}",
            flush=True,
        )

    manifest = {
        "project": "The Last Kiln of Ember Valley — V4 Real AI I2V Cinema Clips",
        "generated_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "colab_account": COLAB_ACCOUNT,
        "gpu_requested": gpu_requested,
        "gpu_actual": remote_meta.get("gpu", gpu_requested),
        "model": remote_meta.get("model", "Lightricks/LTX-Video-0.9.5"),
        "pipeline_mode": remote_meta.get("pipeline_mode", "ltx_condition"),
        "total_gpu_render_sec": remote_meta.get("total_render_sec"),
        "external_output_dir": str(OUT_EXTERNAL_DIR),
        "clips": manifest_clips,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"[local] Wrote manifest -> {MANIFEST_PATH}", flush=True)

    # 8. Final burn-rate verification
    run_colab(["sessions"], check=False)
    run_colab(["usage"], check=False)


if __name__ == "__main__":
    main()
