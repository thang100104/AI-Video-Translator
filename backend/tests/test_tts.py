import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, patch
import pytest
from edge_tts.exceptions import NoAudioReceived
from app.pipeline import speak


def test_tts_retries_transient_failure_and_removes_partial_audio(tmp_path):
    path = tmp_path / 'voice.mp3'
    calls = []
    async def save(target):
        calls.append(target)
        if len(calls) == 1:
            Path(target).write_bytes(b'partial')
            raise NoAudioReceived('temporary failure')
        assert not Path(target).exists()
        Path(target).write_bytes(b'valid audio fixture')
    with patch('edge_tts.Communicate') as communicate, patch('app.pipeline.asyncio.sleep',new_callable=AsyncMock):
        communicate.return_value.save = save
        asyncio.run(speak('Xin chào','female',path))
    assert len(calls) == 2 and path.read_bytes() == b'valid audio fixture'


def test_tts_failure_does_not_leave_audio_or_report_success(tmp_path):
    path = tmp_path / 'voice.mp3'
    with patch('edge_tts.Communicate') as communicate, patch('app.pipeline.asyncio.sleep',new_callable=AsyncMock):
        communicate.return_value.save = AsyncMock(side_effect=NoAudioReceived('unavailable'))
        with pytest.raises(RuntimeError,match='3 lần thử'):
            asyncio.run(speak('Xin chào','male',path))
        assert communicate.return_value.save.await_count == 3
    assert not path.exists()
