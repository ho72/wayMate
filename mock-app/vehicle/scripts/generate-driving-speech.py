#!/usr/bin/env python3
"""Generate bundled Korean driving prompts with macOS Yuna. No network or paid provider."""
from pathlib import Path
import hashlib, json, re, subprocess, tempfile, unicodedata, shutil
root = Path(__file__).resolve().parents[2]
assets = root / 'assets/audio/prepared-v1'
index = assets / 'index.json'
data = json.loads(index.read_text())
seen = {entry['sha256Text'] for entry in data['entries']}
source = root / 'vehicle/app/src/main/java/com/waymate/app/model/DrivingContext.kt'
texts = re.findall(r'const val \w+ = "([^"]+)"', source.read_text())
texts += ['저는 오늘 만난 조용한 바다가 기억에 남아요.', '저도 바다를 보며 걷는 게 좋아요.',
          '저는 조용한 카페도 좋아해요.', '안녕하세요. 오늘 바다 풍경이 참 좋네요.']
with tempfile.TemporaryDirectory(prefix='durumit-local-voice-') as temp:
    for text in texts:
        digest = hashlib.sha256(unicodedata.normalize('NFC', text).encode()).hexdigest()
        filename = 'speech_' + digest[:24] + '.m4a'
        existing = assets / filename
        def valid_audio(path):
            result = subprocess.run([shutil.which('ffprobe') or 'ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', str(path)], capture_output=True, text=True)
            return result.returncode == 0 and any(s.get('codec_type') == 'audio' for s in json.loads(result.stdout).get('streams', []))
        if digest in seen and valid_audio(existing):
            continue
        aiff = Path(temp) / 'line.aiff'
        subprocess.run(['/usr/bin/say', '-v', 'Yuna', '-r', '175', '-o', str(aiff), text], check=True)
        subprocess.run([shutil.which('ffmpeg') or 'ffmpeg', '-loglevel', 'error', '-y', '-i', str(aiff), '-c:a', 'aac', '-b:a', '96k', str(assets / filename)], check=True)
        if not valid_audio(assets / filename):
            raise RuntimeError('Speech synthesis produced no audio track: ' + text)
        if digest not in seen: data['entries'].append(dict(file=filename, sha256Text=digest, text=text, speaker='agent', voice='Yuna', sourceKind='prepared_narration'))
        seen.add(digest)
index.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print(f"Prepared clips: {len(data['entries'])}")
