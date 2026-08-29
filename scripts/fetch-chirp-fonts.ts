import { defaultChirpCacheDir, ensureChirpFonts } from '../src/render/x/chirpFonts.js';

const faces = await ensureChirpFonts();
console.log(`Chirp fonts in ${defaultChirpCacheDir()}: ${faces.map((f) => f.file).join(', ')}`);
