import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import ffmpeg from 'fluent-ffmpeg';
import { existsSync, writeFileSync } from 'fs';

const ffmpegPath = process.env.FFMPEG_PATH || 'C:\\ffmpeg\\bin\\ffmpeg.exe';
if (existsSync(ffmpegPath)) ffmpeg.setFfmpegPath(ffmpegPath);

const demuxerPath = 'C:\\Users\\danir\\AppData\\Local\\Temp\\debug_concat_list.txt';
const content = "file 'C:\\Users\\danir\\AppData\\Local\\Temp\\tb0.mp4'\nfile 'C:\\Users\\danir\\AppData\\Local\\Temp\\tb1.mp4'\n";
writeFileSync(demuxerPath, content, 'utf-8');
console.log('Demuxer file exists after write:', existsSync(demuxerPath));

ffmpeg()
  .input(demuxerPath)
  .inputOptions(['-f', 'concat', '-safe', '0'])
  .outputOptions(['-c copy', '-movflags +faststart', '-y'])
  .output('C:\\Users\\danir\\AppData\\Local\\Temp\\debug_concat_out.mp4')
  .on('start', cmd => console.log('CMD:', cmd))
  .on('stderr', line => console.log('STDERR:', line))
  .on('end', () => console.log('SUCCESS'))
  .on('error', (err) => console.error('ERROR:', err.message))
  .run();
