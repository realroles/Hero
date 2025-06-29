require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { OpenAI } = require('openai');
const textToSpeech = require('@google-cloud/text-to-speech');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('translated'));

// Create folders if not exist
['uploads', 'translated'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

const upload = multer({ dest: 'uploads/' });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ttsClient = new textToSpeech.TextToSpeechClient();

app.post('/api/translate', upload.single('video'), async (req, res) => {
  try {
    const { language } = req.body;
    const vid = req.file.path;
    const audioIn = `uploads/${req.file.filename}.wav`;
    const audioOut = `translated/${req.file.filename}-dub.mp3`;
    const finalVid = `translated/${req.file.filename}-final.mp4`;

    // Step 1: Extract audio from uploaded video
    execSync(`ffmpeg -i ${vid} -vn -acodec pcm_s16le -ar 44100 -ac 2 ${audioIn}`);

    // Step 2: Transcribe original audio using Whisper
    const transRes = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioIn),
      model: "whisper-1"
    });
    const originalText = transRes.text;

    // Step 3: Translate text using ChatGPT
    const translationRes = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: `Translate the following text to ${language}:` },
        { role: "user", content: originalText }
      ]
    });
    const translatedText = translationRes.choices[0].message.content;

    // Step 4: Convert translated text to speech using Google TTS
    const [ttsRes] = await ttsClient.synthesizeSpeech({
      input: { text: translatedText },
      voice: {
        languageCode: getLanguageCode(language),
        ssmlGender: 'NEUTRAL'
      },
      audioConfig: { audioEncoding: 'MP3' }
    });
    fs.writeFileSync(audioOut, ttsRes.audioContent, 'binary');

    // Step 5: Merge dubbed audio back into original video
    execSync(`ffmpeg -i ${vid} -i ${audioOut} -c:v copy -map 0:v:0 -map 1:a:0 -shortest ${finalVid}`);

    // Step 6: Clean temp files
    fs.unlinkSync(audioIn);
    fs.unlinkSync(vid);

    const url = `${req.protocol}://${req.get('host')}/${path.basename(finalVid)}`;
    res.json({ success: true, downloadUrl: url });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Language code mapping for Google TTS
function getLanguageCode(language) {
  const map = {
    Hindi: 'hi-IN',
    English: 'en-US',
    Spanish: 'es-ES',
    French: 'fr-FR',
    German: 'de-DE',
    Tamil: 'ta-IN',
    Telugu: 'te-IN',
    Bengali: 'bn-IN',
    Marathi: 'mr-IN'
    // आप अपनी ज़रूरत के हिसाब से और भाषाएं जोड़ सकते हैं
  };
  return map[language] || 'en-US';
}

app.listen(process.env.PORT || 3001, () => {
  console.log('🚀 Server running on port 3001');
});