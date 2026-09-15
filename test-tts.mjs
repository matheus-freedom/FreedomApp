// ============================================================
// Testes das vozes por personagem no listening (sem rede, sem IA).
// Roda com:  node test-tts.mjs
// ============================================================

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('./netlify/functions/lib/tts-speakers.js');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

const DIALOGO = `Tom: Hi Sarah! Are you coming to the family dinner?
Sarah: Yes, I am. My sister is coming too.
Tom: Great! My brother is bringing the cake.
Sarah: That is wonderful.`;

console.log('\n── Detecção de personagens ──');
let sp = T.parseSpeakers(DIALOGO);
check('Acha os 2 personagens do diálogo', sp.length === 2 && sp[0].speaker === 'Tom' && sp[1].speaker === 'Sarah', JSON.stringify(sp));
check('Conta as falas de cada um', sp[0].lines === 2 && sp[1].lines === 2);
check('Monólogo não tem personagens', T.parseSpeakers('Welcome to our podcast about family. Today we talk about...').length === 0);
check('"Visit:"/"Note:" com 1 linha cada não viram diálogo',
  T.buildTts('Visit: https://example.com for info.\nNote: our shop opens at nine.', { fallbackVoice: 'Kore' }).multi === false);
check('Rótulo minúsculo não vira personagem', T.parseSpeakers('note: this is not a speaker\nTom: hello\nAnna: hi').length === 2);

console.log('\n── Gênero pelo nome ──');
check('Tom é masculino', T.genderOfName('Tom') === 'Male');
check('Sarah é feminino', T.genderOfName('Sarah') === 'Female');
check('Nome composto usa o primeiro nome (Mary Jane)', T.genderOfName('Mary Jane') === 'Female');
check('Nome desconhecido devolve null', T.genderOfName('Zorblax') === null);
check('"Chris" (ambíguo) devolve null', T.genderOfName('Chris') === null);

console.log('\n── Atribuição de vozes ──');
const two = (a, b) => T.assignVoices([{ speaker: a, lines: 2 }, { speaker: b, lines: 2 }], 'American');
let v = two('Tom', 'Sarah');
check('Homem ganha voz masculina (Puck)', v[0].voiceName === 'Puck', JSON.stringify(v));
check('Mulher ganha voz feminina (Kore)', v[1].voiceName === 'Kore', JSON.stringify(v));
v = two('Sarah', 'Emma');
check('Duas mulheres ganham vozes DIFERENTES', v[0].voiceName !== v[1].voiceName && v[0].voiceName === 'Kore' && v[1].voiceName === 'Leda', JSON.stringify(v));
v = two('Tom', 'David');
check('Dois homens ganham vozes DIFERENTES', v[0].voiceName !== v[1].voiceName && v[0].voiceName === 'Puck' && v[1].voiceName === 'Charon', JSON.stringify(v));
v = two('Zorblax', 'Sarah');
check('Desconhecido + mulher → desconhecido vira homem', v[0].voiceName === 'Puck' && v[1].voiceName === 'Kore', JSON.stringify(v));
v = two('Tom', 'Zorblax');
check('Homem + desconhecido → desconhecido vira mulher', v[0].voiceName === 'Puck' && v[1].voiceName === 'Kore', JSON.stringify(v));
v = two('Zorblax', 'Blipnar');
check('Dois desconhecidos → vozes de gêneros opostos', v[0].voiceName === 'Kore' && v[1].voiceName === 'Puck', JSON.stringify(v));
v = T.assignVoices([{ speaker: 'Tom', lines: 2 }, { speaker: 'Sarah', lines: 2 }], 'British');
check('Sotaque britânico usa o par Fenrir/Zephyr', v[0].voiceName === 'Fenrir' && v[1].voiceName === 'Zephyr', JSON.stringify(v));

console.log('\n── Montagem da chamada de TTS ──');
let t = T.buildTts(DIALOGO, { accent: 'American', fallbackVoice: 'Kore' });
check('Diálogo de 2 vira multi-speaker', t.multi === true);
check('speechConfig traz as 2 vozes', t.speechConfig.multiSpeakerVoiceConfig?.speakerVoiceConfigs?.length === 2);
check('Cada personagem aponta para sua voz',
  t.speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs[0].speaker === 'Tom' &&
  t.speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs[0].voiceConfig.prebuiltVoiceConfig.voiceName === 'Puck' &&
  t.speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs[1].voiceConfig.prebuiltVoiceConfig.voiceName === 'Kore');
check('Instrução de conversa vem antes do roteiro', t.contents[0].parts[0].text.startsWith('TTS the following conversation between Tom and Sarah:'));
check('O roteiro completo segue no texto', t.contents[0].parts[0].text.includes('family dinner'));

t = T.buildTts('Welcome to our podcast. Today we talk about jobs and work.', { accent: 'American', fallbackVoice: 'Kore' });
check('Monólogo continua com voz única (fallback)', t.multi === false && t.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName === 'Kore');
check('Monólogo é lido sem prefixo de instrução', t.contents[0].parts[0].text.startsWith('Welcome to our podcast'));

t = T.buildTts('word', { accent: 'American', fallbackVoice: 'Puck' });
check('Palavra solta (tradução) mantém a voz pedida', t.multi === false && t.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName === 'Puck');

const tres = `Anna: hi\nTom: hello\nDavid: hey\nAnna: ok`;
t = T.buildTts(tres, { accent: 'American', fallbackVoice: 'Kore' });
check('3+ personagens caem no fallback de voz única (limite do Gemini)', t.multi === false);

console.log('\n── Sotaque implícito na voz do aluno ──');
check('Fenrir/Zephyr → British', T.accentOfVoice('Fenrir') === 'British' && T.accentOfVoice('Zephyr') === 'British');
check('Puck/Kore → American', T.accentOfVoice('Puck') === 'American' && T.accentOfVoice('Kore') === 'American');

console.log('\n── Versão do áudio ──');
check('AUDIO_VERSION é 2 (invalida os áudios de voz única)', T.AUDIO_VERSION === 2);

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passaram, ${fail} falharam\n`);
process.exit(fail === 0 ? 0 : 1);
