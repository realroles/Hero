// server.js require('dotenv').config(); const express = require('express'); const multer = require('multer'); const cors = require('cors'); const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process'); const { OpenAI } = require('openai'); const textToSpeech = require('@google-cloud/text-to-speech');

const app = express(); app.use(cors()); app.use(express.json()); app.use(express.static('translated')); const upload = multer({ dest: 'uploads/' });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); const ttsClient = new textToSpeech.TextToSpeechClient();

app.post('/api/translate', upload.single('video'), async (req, res) => { try { const { language } = req.body; const vid = req.file.path; const audioIn = uploads/${req.file.filename}.wav; const audioOut = translated/${req.file.filename}-dub.mp3; const finalVid = translated/${req.file.filename}-final.mp4;

// Extract audio from video
execSync(`ffmpeg -i ${vid} -vn -acodec pcm_s16le -ar 44100 -ac 2 ${audioIn}`);

// Transcribe and translate using OpenAI Whisper
const transRes = await openai.audio.translations.create({
  file: fs.createReadStream(audioIn),
  model: "whisper-1",
  target_lang: language
});
const translatedText = transRes.text;

// Generate speech using Google TTS
const [ttsRes] = await ttsClient.synthesizeSpeech({
  input: { text: translatedText },
  voice: {
    languageCode: language === 'Hindi' ? 'hi-IN' : 'en-US',
    ssmlGender: 'NEUTRAL'
  },
  audioConfig: { audioEncoding: 'MP3' }
});
fs.writeFileSync(audioOut, ttsRes.audioContent, 'binary');

// Merge dubbed audio with video
execSync(`ffmpeg -i ${vid} -i ${audioOut} -c:v copy -map 0:v:0 -map 1:a:0 -shortest ${finalVid}`);

const url = `${req.protocol}://${req.get('host')}/${path.basename(finalVid)}`;
res.json({ success: true, downloadUrl: url });

} catch (err) { console.error(err); res.status(500).json({ success: false, message: err.message }); } });

app.listen(process.env.PORT || 3001, () => console.log('Running'));

