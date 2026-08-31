import React from 'react';

// ══════════════════════════════════════════════════════════════
// FRED — O MASCOTE DA FREEDOM
// ──────────────────────────────────────────────────────────────
// Este arquivo centraliza as imagens do Fred em UM lugar só.
// Por quê? Se um dia você trocar as artes (ou criar as da Frida),
// basta mexer aqui — todas as telas atualizam juntas, sem caçar
// caminho de imagem espalhado pelo código.
//
// As imagens ficam em /public/fred/*.webp. Tudo que está na pasta
// "public" do Vite é copiado para o site final e pode ser acessado
// pela URL direta (ex.: /fred/fred-feliz.webp). WebP é um formato
// ~90% mais leve que PNG, o que importa no celular dos alunos.
// ══════════════════════════════════════════════════════════════

// Cada "expressão" corresponde a um momento do app:
// - perfil:   avatar padrão (botão e cabeçalho do chat de dúvidas)
// - feliz:    celebração — o aluno acertou uma questão
// - surpreso: o aluno acertou 5 seguidas (momento "uau!")
// - triste:   o aluno errou uma alternativa
// - motivado: mensagem de incentivo (2+ erros seguidos, nota baixa)
export type FredExpression = 'perfil' | 'feliz' | 'surpreso' | 'triste' | 'motivado';

export const FRED_IMAGES: Record<FredExpression, string> = {
  perfil: '/fred/fred-perfil.webp',
  feliz: '/fred/fred-feliz.webp',
  surpreso: '/fred/fred-surpreso.webp',
  triste: '/fred/fred-triste.webp',
  motivado: '/fred/fred-motivado.webp',
};

// Versão quadrada, recortada no rosto — ideal para círculos pequenos
// (se usássemos a imagem de corpo inteiro num círculo de 40px, o
// rosto ficaria minúsculo e irreconhecível).
export const FRED_FACE = '/fred/fred-perfil-rosto.webp';

interface FredAvatarProps {
  expression?: FredExpression;
  // 'face' = rosto recortado em círculo | 'full' = corpo inteiro
  variant?: 'face' | 'full';
  className?: string;
  alt?: string;
}

const FredAvatar: React.FC<FredAvatarProps> = ({
  expression = 'perfil',
  variant = 'full',
  className = '',
  alt = 'Fred, o guia da Freedom',
}) => {
  const src = variant === 'face' ? FRED_FACE : FRED_IMAGES[expression];
  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      // object-contain garante que a imagem inteira apareça sem cortar;
      // select-none evita o aluno "arrastar" a imagem sem querer no celular.
      className={`object-contain select-none pointer-events-none ${className}`}
    />
  );
};

export default FredAvatar;
