#!/usr/bin/env python3
"""Create 8 professional slides + stitch into video with ffmpeg."""
import subprocess, sys, os
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DEMO = r"C:\Users\cnkku\Desktop\opencode\alexa-mcp-server\demo"
FFMPEG = subprocess.run(["where", "ffmpeg"], capture_output=True, text=True).stdout.strip().split("\n")[0]
FONT = r"C\:/Windows/Fonts/consola.ttf"  # ffmpeg-escaped font path

os.makedirs(DEMO, exist_ok=True)

slides = [
    # (filename, texts: list of (text, color, size, x, y))
    ("slide1.png", [
        ("Supabase RLS Security Audit MCP Server", "0x00d4aa", 42, "center", "center-60"),
        ("Zero-Dependency | MCP Spec 2025-11-25 | Streamable HTTP", "0x8899aa", 20, "center", "center+20"),
        ("Amazon Developer Hackathon - Alexa+ Track", "0x586e8c", 18, "center", "center+60"),
    ], "0x1a1a2e"),
    ("slide2.png", [
        ("What It Does", "0x00d4aa", 36, "60", "60"),
        ("Scans GitHub repos for Supabase RLS security issues", "0xe0e0e0", 22, "60", "140"),
        ("[CRITICAL] Committed service_role JWTs", "0xf85149", 20, "100", "200"),
        ("[HIGH] RLS policies open to anon/public", "0xf0883e", 20, "100", "240"),
        ("[MEDIUM] Write-all policies for authenticated", "0xd29922", 20, "100", "280"),
        ("Every finding includes 30-second verify query + fix SQL", "0x8b949e", 16, "60", "360"),
    ], "0x0d1117"),
    ("slide3.png", [
        ("MCP Tools (3)", "0x00d4aa", 36, "60", "60"),
        ("scan_repo", "0x7ee787", 24, "100", "150"),
        ("  Full audit: severity-ranked markdown report", "0x8b949e", 18, "140", "185"),
        ("get_summary", "0x7ee787", 24, "100", "240"),
        ("  Quick summary: finding counts by severity", "0x8b949e", 18, "140", "275"),
        ("get_fix", "0x7ee787", 24, "100", "330"),
        ("  Fix SQL for specific vulnerability patterns", "0x8b949e", 18, "140", "365"),
    ], "0x0d1117"),
    ("slide4.png", [
        ("Demo: scan_repo Azizbek18/YotoqxonaTizimi", "0x00d4aa", 28, "60", "60"),
        ("3 findings detected:", "0xe0e0e0", 22, "60", "140"),
        ("[HIGH] Allow public read on cleaning_schedule", "0xf0883e", 18, "100", "190"),
        ("       open to anon with USING(true)", "0x6e7681", 16, "140", "220"),
        ("[HIGH] Anon email check on public.staff", "0xf0883e", 18, "100", "260"),
        ("       staff table readable by anyone with anon key", "0x6e7681", 16, "140", "290"),
        ("[MEDIUM] Allow authenticated insert/update", "0xd29922", 18, "100", "330"),
        ("       any logged-in user can rewrite any row", "0x6e7681", 16, "140", "360"),
    ], "0x0d1117"),
    ("slide5.png", [
        ("Demo: get_summary pixelsock/mtxProductConfig", "0x00d4aa", 28, "60", "60"),
        ("2 CRITICAL findings:", "0xf85149", 22, "60", "140"),
        ("[CRITICAL] Committed service_role JWT", "0xf85149", 18, "100", "190"),
        ("          project ref: akwhptzlqgtlcpzvcnjl", "0x6e7681", 16, "140", "220"),
        ("[CRITICAL] Committed sb_secret_ key", "0xf85149", 18, "100", "260"),
        ("          full database access - live until rotated", "0x6e7681", 16, "140", "290"),
        ("Fix: Rotate keys FIRST in Supabase dashboard", "0x00d4aa", 18, "60", "360"),
    ], "0x0d1117"),
    ("slide6.png", [
        ("Demo: get_summary antifailure/antifailure", "0x00d4aa", 28, "60", "60"),
        ("CLEAN - No RLS red flags found", "0x3fb950", 24, "60", "150"),
        ("Zero false positives on well-configured repos", "0x8b949e", 18, "60", "210"),
        ("The engine only flags genuine vulnerabilities", "0x8b949e", 18, "60", "240"),
    ], "0x0d1117"),
    ("slide7.png", [
        ("get_fix: login_helper_anon", "0x00d4aa", 28, "60", "60"),
        ("Problem: Staff table open to anon for email check", "0xe0e0e0", 18, "60", "130"),
        ("Fix: SECURITY DEFINER function (table stays sealed)", "0x00d4aa", 18, "60", "170"),
        ("CREATE OR REPLACE FUNCTION email_exists(email TEXT)", "0x79c0ff", 16, "60", "220"),
        ("RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER", "0x79c0ff", 16, "60", "250"),
        ("AS $$ SELECT EXISTS(SELECT 1 FROM users", "0x79c0ff", 16, "60", "280"),
        ("       WHERE email = email_exists.email); $$;", "0x79c0ff", 16, "60", "310"),
        ("REVOKE ALL ON public.users FROM anon;", "0x7ee787", 16, "60", "350"),
    ], "0x0d1117"),
    ("slide8.png", [
        ("Supabase RLS Security Audit MCP Server", "0x00d4aa", 36, "center", "center-80"),
        ("Zero dependencies | MCP 2025-11-25 | MIT License", "0x8899aa", 20, "center", "center-30"),
        ("Tested on 3 production repos (findings verified)", "0x3fb950", 18, "center", "center+30"),
        ("github.com/cekuu35/alexa-mcp-server", "0x00d4aa", 24, "center", "center+90"),
    ], "0x1a1a2e"),
]

print("Creating slides...")
for filename, texts, bg in slides:
    vf_parts = []
    for text, color, size, x, y in texts:
        # Escape text for ffmpeg filter
        escaped = text.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:")
        escaped = escaped.replace("[", "\\[").replace("]", "\\]")
        escaped = escaped.replace(",", "\\,").replace(";", "\\;")
        escaped = escaped.replace("'", "\\'")
        # Handle center positioning
        if x == "center":
            x_expr = "(w-text_w)/2"
        else:
            x_expr = x
        if y.startswith("center"):
            offset = y.replace("center", "")
            y_expr = f"(h-text_h)/2{offset}"
        else:
            y_expr = y
        vf_parts.append(
            f"drawtext=fontfile='{FONT}':text='{escaped}':fontcolor={color}:fontsize={size}:x={x_expr}:y={y_expr}"
        )

    vf = ",".join(vf_parts)
    outfile = os.path.join(DEMO, filename)
    cmd = [FFMPEG, "-y", "-f", "lavfi", "-i", f"color=c={bg}:s=1280x720:d=1",
           "-vf", vf, "-frames:v", "1", "-update", "1", outfile]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        print(f"  OK: {filename}")
    else:
        print(f"  FAIL: {filename} — {result.stderr[-200:]}")

# Stitch slides into video — variable durations for pacing
print("\nCreating video segments...")
segments = []
durations = [5, 5, 5, 8, 8, 5, 8, 5]  # seconds per slide (total: 49 sec)
for i, (filename, _, _) in enumerate(slides, 1):
    segfile = os.path.join(DEMO, f"seg{i}.mp4")
    infile = os.path.join(DEMO, filename)
    dur = durations[i-1] if i <= len(durations) else 5
    cmd = [FFMPEG, "-y", "-loop", "1", "-i", infile, "-c:v", "libx264",
           "-t", str(dur), "-pix_fmt", "yuv420p", "-vf", "scale=1280:720", "-r", "24", segfile]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode == 0:
        segments.append(segfile)
        print(f"  OK: seg{i}.mp4")
    else:
        print(f"  FAIL: seg{i}.mp4 — {r.stderr[-100:]}")

# Concat
print("\nConcatenating...")
concat_file = os.path.join(DEMO, "concat.txt")
with open(concat_file, "w") as f:
    for seg in segments:
        f.write(f"file '{seg}'\n")

outfile = os.path.join(DEMO, "alexa-mcp-demo.mp4")
cmd = [FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", concat_file, "-c", "copy", outfile]
r = subprocess.run(cmd, capture_output=True, text=True)
if r.returncode == 0:
    size = os.path.getsize(outfile) / 1024 / 1024
    print(f"\nVIDEO CREATED: alexa-mcp-demo.mp4 ({size:.1f} MB)")
else:
    print(f"FAIL: {r.stderr[-200:]}")
