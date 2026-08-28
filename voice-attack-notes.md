# Voice attack changes

This workspace currently contains uncommitted changes for voice-driven attacks.

Main changes:
- Camera startup now requests microphone audio as well as video.
- Web Audio measures microphone volume and shows a MIC meter.
- Browser SpeechRecognition / webkitSpeechRecognition transcribes Japanese speech.
- P1 VOICE and P2 VOICE panels show the latest recognized speech by speaker.
- Speech is assigned to the player whose mouth is open, falling back to player 1.
- Recognized speech creates per-character homing text attacks from the mouth toward the opponent.
- Voice attacks use larger text and more damage when the microphone level is higher.
- Voice panels clear shortly after an attack is emitted, unless newer speech has arrived.
- Text attacks have no textbox frame, no tail line, wider character spacing, slower movement, wobble, glow, and echo.

Restore after pull:

```sh
git apply voice-attack-changes.patch
npm run build
```
