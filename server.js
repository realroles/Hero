require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { OpenAI } = require('openai');
const textToSpeech = require('@google-cloud/text-to-speech');
const sanitize = require('sanitize-filename');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('translated'));

// Create folders
['uploads', 'translated'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

const upload = multer({ dest: 'uploads/' });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ttsClient = new textToSpeech.TextToSpeechClient();

const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;

// 📥 Extract audio from video
function extractAudio(videoPath, outputPath) {
  execSync(`ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 44100 -ac 2 "${outputPath}"`);
}

// 📄 Transcribe audio using Whisper
async function transcribeAudio(audioPath) {
  const response = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: "whisper-1"
  });
  return response.text;
}

// 🌍 Translate text using GPT
async function translateText(text, language) {
  const res = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: `Translate the following text to ${language}:` },
      { role: "user", content: text }
    ]
  });
  return res.choices[0].message.content;
}

// 🔊 Convert text to speech
async function synthesizeSpeech(text, language, outputPath) {
  const [response] = await ttsClient.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: getLanguageCode(language),
      ssmlGender: 'NEUTRAL'
    },
    audioConfig: { audioEncoding: 'MP3' }
  });
  fs.writeFileSync(outputPath, response.audioContent, 'binary');
}

// 🎞️ Merge audio with original video
function mergeAudioWithVideo(videoPath, audioPath, outputPath) {
  execSync(`ffmpeg -i "${videoPath}" -i "${audioPath}" -c:v copy -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`);
}

// 🗑 Cleanup files
function cleanup(...paths) {
  paths.forEach(p => {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
}

// 🌐 Language map
function getLanguageCode(language) {
  const map = {
    Hindi: 'hi-IN',
    English: 'en-US',
    Spanish: 'es-ES',
    French: 'fr-FR',
    German: 'de-DE',
    Chinese: 'cmn-CN',
    Japanese: 'ja-JP',
    Russian: 'ru-RU',
    Arabic: 'ar-XA',
    Portuguese: 'pt-PT',
    Tamil: 'ta-IN',
    Telugu: 'te-IN',
    Bengali: 'bn-IN',
    Marathi: 'mr-IN'
  };
  return map[language] || 'en-US';
}

// 📡 API Route
app.post('/api/translate', upload.single('video'), async (req, res) => {
  try {
    const language = req.body.language;
    const file = req.file;
    const safeName = sanitize(file.filename);
    const inputVideo = file.path;
    const audioRaw = `uploads/${safeName}.wav`;
    const dubbedAudio = `translated/${safeName}-dub.mp3`;
    const finalVideo = `translated/${safeName}-final.mp4`;

    extractAudio(inputVideo, audioRaw);
    const originalText = await transcribeAudio(audioRaw);
    const translatedText = await translateText(originalText, language);
    await synthesizeSpeech(translatedText, language, dubbedAudio);
    mergeAudioWithVideo(inputVideo, dubbedAudio, finalVideo);
    cleanup(audioRaw, inputVideo, dubbedAudio);

    const downloadUrl = `${BASE_URL}/${path.basename(finalVideo)}`;
    res.json({ success: true, downloadUrl });
  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 🔊 Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});