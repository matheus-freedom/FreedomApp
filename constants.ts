
import { Level, Theme } from './types';

type TopicMap = {
  [key in Theme]?: string[];
};

type LevelMap = {
  [key in Level]: TopicMap;
};

// Define vocabulary lists separately to reuse for Listening
const VOCAB_A1 = [
  "Cumprimentos e apresentações", "Países, nacionalidades e línguas", "Números", "A Família",
  "Cores e formas", "Dias da semana, meses e estações", "Horas e das datas", "Partes do corpo humano",
  "Aparência física", "Vestuário e acessórios", "Objetos pessoais", "Divisões da casa e mobiliário",
  "Comida e bebida", "No restaurante", "Profissões e locais de trabalho", "Rotina diária",
  "Tempos livres e hobbies", "Desportos comuns", "Transportes e viagens", "Lugares na cidade",
  "Direções e localização", "O tempo e meteorologia", "Animais", "Saúde básica",
  "Sentimentos básicos", "Escola e sala de aula", "Compras", "Tecnologia básica",
  "Férias e turismo", "Habilidades"
];

const VOCAB_A2 = [
  "Cumprimentos e apresentações", "Países, nacionalidades e línguas", "Números", "A Família",
  "Cores e formas", "Dias da semana, meses e estações", "Horas e datas", "Partes do corpo humano",
  "Aparência física", "Vestuário e acessórios", "Objetos pessoais", "Divisões da casa e mobiliário",
  "Comida e bebida", "No restaurante", "Profissões e locais de trabalho", "Rotina diária",
  "Tempos livres e hobbies", "Desportos comuns", "Transportes e viagens", "Lugares na cidade",
  "Direções e localização", "O tempo e meteorologia", "Animais", "Saúde básica",
  "Sentimentos básicos", "Escola e sala de aula", "Compras", "Tecnologia básica",
  "Férias e turismo", "Habilidades"
];

const VOCAB_B1 = [
  "Personalidade e caráter", "Relações interpessoais", "Sentimentos e emoções", "Educação e sistemas de ensino",
  "Mundo do trabalho", "Negócios e escritório", "Crime e justiça", "Meio ambiente e poluição",
  "Desastres naturais", "Política e sociedade", "Meios de comunicação", "Redes sociais e comportamento online",
  "Cinema, teatro e literatura", "Música e artes", "Viagens aéreas e problemas em viagem", "Alojamento detalhado",
  "Saúde e estilo de vida", "Doenças e tratamentos médicos", "Ciência e inovação tecnológica",
  "Culinária e preparação de alimentos", "Moda, tendências e estilo", "Dinheiro e banca",
  "Publicidade e consumismo", "Tradições culturais e festivais", "Estereótipos e diversidade cultural",
  "Problemas globais", "Trânsito e condução", "Reparações domésticas e bricolage",
  "Gíria e linguagem informal comum", "Expressões de tempo e frequência"
];

const VOCAB_B2 = [
  "Personalidade e caráter", "Relações interpessoais", "Sentimentos e emoções", "Educação e sistemas de ensino",
  "Mundo do trabalho", "Negócios e escritório", "Crime e justiça", "Meio ambiente e poluição",
  "Desastres naturais", "Política e sociedade", "Meios de comunicação", "Redes sociais e comportamento online",
  "Cinema, teatro e literatura", "Música e artes", "Viagens aéreas e problemas em viagem", "Alojamento detalhado",
  "Saúde e estilo de vida", "Doenças e tratamentos médicos", "Ciência e inovação tecnológica",
  "Culinária e preparação de alimentos", "Moda, tendências e estilo", "Dinheiro e banca",
  "Publicidade e consumismo", "Tradições culturais e festivais", "Estereótipos e diversidade cultural",
  "Problemas globais", "Trânsito e condução", "Reparações domésticas e bricolage",
  "Gíria e linguagem informal comum", "Expressões de tempo e frequência"
];

const VOCAB_C1 = [
  "Expressões idiomáticas e provérbios", "Phrasal Verbs complexos e polissémicos", "Colocações",
  "Linguagem académica e pesquisa científica", "Economia global e mercado financeiro", "Relações internacionais e diplomacia",
  "Ética e moralidade", "Psicologia e mente humana", "Retórica, persuasão e debate",
  "Humor, ironia, sarcasmo e trocadilhos", "Crítica de arte e apreciação estética", "Literatura clássica e contemporânea",
  "Dialetos, sotaques e registos de linguagem", "Urbanismo e arquitetura sustentável", "História e civilizações",
  "Filosofia e pensamento abstrato", "Linguagem jurídica e leis", "Bioética e engenharia genética",
  "Tecnologias emergentes", "Energias renováveis e sustentabilidade avançada", "Gestão empresarial e liderança",
  "Empreendedorismo e startups", "Jornalismo e liberdade de expressão", "Demografia e migrações populacionais",
  "Astronomia e exploração espacial", "Zoologia e botânica", "Manias, fobias e obsessões",
  "Linguagem corporal e comunicação não-verbal", "Eufemismos e linguagem politicamente correta", "Sensações e descrições vívidas"
];

const GRAMMAR_A1 = [
  "Verbo To Be (afirmativa, negativa, interrogativa)",
  "Present Continuous",
  "Simple Present (rotinas e fatos)",
  "Teste: Todos os tempos presentes (To be, ing e Present Simple)",
  "To Be past (Was, Were)",
  "Past simple (Did, Didn't, regular, irregular verbs in the past)",
  "Irregular Verbs in the Past",
  "Used To (Hábitos do passado)",
  "Present Perfect",
  "Teste: Todos os tempos passados (To be past, Past simple, Used to, Present Perfect)",
  "Futuro com ing (Arranged future: “I'm doing it tomorrow”)",
  "Futuro com ‘Going to”",
  "Futuro com Will",
  "Teste: Todos os tempos futuros (Futuro com ing, Going to e Will)",
  "Modal: Might",
  "Modal: Can e Could",
  "Modal: Must",
  "Modal: Should",
  "Modal: Would",
  "Teste: Todos os modais (Might, Can, Could, Must, Should, Would)",
  "Final test (todos os tópicos gramaticais de A1)"
];

const GRAMMAR_A2 = [
  "There is/ There are vs Have (Existencia e posse)",
  "In, on, at (time)",
  "In, on, at (place)",
  "Múltiplas utilizações do verbo Get (sem phrasal verbs)",
  "Do vs Make",
  "Teste: (There is, In, On, At, Get, Do vs Make)",
  "Objective Pronouns (Me, you, him, her, it, us, them)",
  "Possessive Pronouns (My/ mine, your/yours, His, Her/hers, its, Our/ours, Their/Theirs)",
  "Reflexive Pronouns (Myself, Yourself, Himself, herself, itself, ourselves, yourselves, themselves)",
  "Teste (Objetive pronouns, Possessive pronouns, Reflexive Pronouns)",
  "Demonstrative pronouns (This/ these, That/ Those)",
  "One, Ones",
  "Some/ Any",
  "Little/ Few",
  "Teste: (Demonstrative pronouns, One/Ones, Some/ Any, Little/ Few)",
  "Comparatives",
  "Superlatives",
  "Comparatives vs Superlatives",
  "Zero and First Conditionals",
  "Infinitive + Ing (verbos que estão no infinitivo com ING)",
  "Final test (todos os tópicos gramaticais de A2)"
];

const GRAMMAR_B1 = [
  "Present Continuous (for intermediate students)",
  "Simple Present (for intermediate students)",
  "Simple Past (for intermediate students)",
  "Present tenses test (for intermediate students)",
  "Past continuous (for intermediate students)",
  "Present Perfect",
  "Present Perfect Continuous",
  "For, Since, Ago",
  "Past Perfect",
  "Past Perfect Continuous",
  "Used to (for intermediate students)",
  "Past tenses Test (simple past, past continuous, used to, present perfect, present perfect continuous)",
  "Have vs Have got (relação de posse)",
  "Future with present tenses",
  "Future: Going to (for intermediate students)",
  "Future: Will (for intermediate students)",
  "Future continuous (Will be doing)",
  "Future perfect (Will have done)",
  "Future tenses test (Future with present tenses, Going to, Will, future continuous, future perfect)",
  "Modais (Can, could, will be able to)",
  "Could have done",
  "Must",
  "May/Might",
  "Have to",
  "Need",
  "Should",
  "Would",
  "Modal verbs test (can/could/will be able, could have done, must, may/might, have to, need, should, would).",
  "Formal Requests",
  "Had Better",
  "Final Test: (todos os tópicos gramaticais de B1)"
];

const GRAMMAR_B2 = [
  "Zero and first conditionals",
  "Second conditionals",
  "Third conditionals,",
  "Conditionals test (Zero, first, second and third conditionals)",
  "Wish",
  "Passive Voice",
  "Reported Speech",
  "Test: Wish/ passive voice, Reported Speech",
  "Verbos infinitivos com ING (for intermediate students)",
  "Infinitivos com To vs Infinitivos com ING.",
  "Prefer to/ Would rather",
  "Prepositions + verbos com ING",
  "Test: Verbos infinitivos com ING, Infinitivos com To vs Infinitivos com ING, Prefer to/ Would rather, Prepositions + verbos com ING.",
  "Adjetivos terminados em ing ou ed",
  "Adverbs",
  "Reflexive pronouns",
  "Possessive Pronouns",
  "Test: Adjetivos terminados em ing ou ed, Adverbs, Reflexive pronouns, Possessive Pronouns.",
  "Some and Any",
  "No, none, any",
  "Test some, any, no, none.",
  "Comparative",
  "Superlative",
  "Comparative vs Superlative (for intermediate students)",
  "Enough, too",
  "Quite, pretty, rather, fairly",
  "Teste: Enough, too, quite, pretty, rather, fairly.",
  "In, on, at (time)",
  "In, on, at (place)",
  "Phrasal Verbs",
  "Relative clauses",
  "Much, many, little, few, a lot, plenty",
  "Conjunctions",
  "All, most none, Both, neither, either",
  "Each and Every.",
  "Final Test: (todos os tópicos gramaticais de B2)"
];

const GRAMMAR_C1 = [
  "Inversão (Inversion for emphasis)", "Cleft Sentences", "Subjunctive (formal)", "Participle Clauses",
  "Futuro no Passado", "Ellipsis e Substituição", "Nuances de Modais", "Discourse Markers avançados"
];

export const TOPICS: LevelMap = {
  [Level.A1]: {
    [Theme.Grammar]: GRAMMAR_A1,
    [Theme.Vocabulary]: VOCAB_A1,
    [Theme.Listening]: [...GRAMMAR_A1, ...VOCAB_A1],
    [Theme.Writing]: [...GRAMMAR_A1, ...VOCAB_A1],
    [Theme.Business]: [
      "Apresentações pessoais", "Apresentar colegas e terceiros", "Países e Nacionalidades",
      "Cumprimentos formais vs. informais", "Troca de cartões de visita", "Oferecer hospitalidade",
      "Despedidas no ambiente de trabalho", "Objetos de escritório e equipamentos", "Departamentos da empresa",
      "Locais no prédio", "Cargos e profissões", "Rotina diária de trabalho", "Horários de trabalho, turnos e pausas",
      "Transporte e deslocamento para o trabalho", "O Alfabeto e Soletração", "Números de telefone e ramais",
      "Atender o telefone", "Transferir chamadas telefônicas", "Anotar recados simples", "Estrutura básica de e-mail",
      "Estratégias para pedir clareza e repetição", "Dias da semana e meses do ano", "Horas e agendamento de compromissos",
      "Datas e prazos", "Preços, moedas e leitura de valores", "Números ordinais", "Descrição básica de produtos",
      "Habilidades e capacidades", "Relatar problemas técnicos simples", "Instruções e comandos simples"
    ],
    [Theme.Reading]: [...GRAMMAR_A1, ...VOCAB_A1]
  },
  [Level.A2]: {
    [Theme.Grammar]: GRAMMAR_A2,
    [Theme.Vocabulary]: VOCAB_A2,
    [Theme.Listening]: [...GRAMMAR_A2, ...VOCAB_A2],
    [Theme.Writing]: [...GRAMMAR_A2, ...VOCAB_A2],
    [Theme.Business]: [
      "Apresentações pessoais", "Apresentar colegas e terceiros", "Países e Nacionalidades",
      "Cumprimentos formais vs. informais", "Troca de cartões de visita", "Oferecer hospitalidade",
      "Despedidas no ambiente de trabalho", "Objetos de escritório e equipamentos", "Departamentos da empresa",
      "Locais no prédio", "Cargos e profissões", "Rotina diária de trabalho", "Horários de trabalho, turnos e pausas",
      "Transporte e deslocamento para o trabalho", "O Alfabeto e Soletração", "Números de telefone e ramais",
      "Atender o telefone", "Transferir chamadas telefônicas", "Anotar recados simples", "Estrutura básica de e-mail",
      "Estratégias para pedir clareza e repetição", "Dias da semana e meses do ano", "Horas e agendamento de compromissos",
      "Datas e prazos", "Preços, moedas e leitura de valores", "Números ordinais", "Descrição básica de produtos",
      "Habilidades e capacidades", "Relatar problemas técnicos simples", "Instruções e comandos simples"
    ],
    [Theme.Reading]: [...GRAMMAR_A2, ...VOCAB_A2]
  },
  [Level.B1]: {
    [Theme.Grammar]: GRAMMAR_B1,
    [Theme.Vocabulary]: VOCAB_B1,
    [Theme.Listening]: [...GRAMMAR_B1, ...VOCAB_B1],
    [Theme.Writing]: [...GRAMMAR_B1, ...VOCAB_B1],
    [Theme.Business]: [
      "Estrutura de e-mails formais e semiformais", "Small Talk avançado e Networking", "Fazer e receber reclamações",
      "Participação em reuniões", "Gerenciar interrupções em reuniões", "Descrever a história e evolução da empresa",
      "Descrever tendências e flutuações de mercado", "Processos de recrutamento e cargos",
      "Entrevistas de emprego (Método STAR)", "Dar e receber feedback construtivo", "Avaliação de desempenho",
      "Vocabulário de Marketing e os 4 Ps", "Apresentação de produtos e serviços", "Estrutura de apresentações eficazes",
      "Lidar com perguntas difíceis em apresentações", "Negociação: Preparação", "Negociação: Barganha e acordo",
      "Organização de viagens de negócios", "Receber visitantes internacionais", "Gestão de projetos",
      "Resolução de problemas em grupo", "Chamadas de vídeo e conferências", "Saúde e segurança no trabalho",
      "Finanças básicas para não-financeiros", "Estratégia corporativa e análise SWOT", "Vendas e técnicas de persuasão",
      "Ética nos negócios e CSR", "Gestão de conflitos", "Linguagem hipotética para negócios", "Redação de relatórios curtos"
    ],
    [Theme.Reading]: [...GRAMMAR_B1, ...VOCAB_B1]
  },
  [Level.B2]: {
    [Theme.Grammar]: GRAMMAR_B2,
    [Theme.Vocabulary]: VOCAB_B2,
    [Theme.Listening]: [...GRAMMAR_B2, ...VOCAB_B2],
    [Theme.Writing]: [...GRAMMAR_B2, ...VOCAB_B2],
    [Theme.Business]: [
      "Estrutura de e-mails formais e semiformais", "Small Talk avançado e Networking", "Fazer e receber reclamações",
      "Participação em reuniões", "Gerenciar interrupções em reuniões", "Descrever a história e evolução da empresa",
      "Descrever tendências e flutuações de mercado", "Processos de recrutamento e cargos",
      "Entrevistas de emprego (Método STAR)", "Dar e receber feedback construtivo", "Avaliação de desempenho",
      "Vocabulário de Marketing e os 4 Ps", "Apresentação de produtos e serviços", "Estrutura de apresentações eficazes",
      "Lidar com perguntas difíceis em apresentações", "Negociação: Preparação", "Negociação: Barganha e acordo",
      "Organização de viagens de negócios", "Receber visitantes internacionais", "Gestão de projetos",
      "Resolução de problemas em grupo", "Chamadas de vídeo e conferências", "Saúde e segurança no trabalho",
      "Finanças básicas para não-financeiros", "Estratégia corporativa e análise SWOT", "Vendas e técnicas de persuasão",
      "Ética nos negócios e CSR", "Gestão de conflitos", "Linguagem hipotética para negócios", "Redação de relatórios curtos"
    ],
    [Theme.Reading]: [...GRAMMAR_B2, ...VOCAB_B2]
  },
  [Level.C1]: {
    [Theme.Grammar]: GRAMMAR_C1,
    [Theme.Vocabulary]: VOCAB_C1,
    [Theme.Listening]: [...GRAMMAR_C1, ...VOCAB_C1],
    [Theme.Writing]: [...GRAMMAR_C1, ...VOCAB_C1],
    [Theme.Business]: [
      "Fusões e Aquisições (M&A)", "Gestão de Crise e Relações Públicas", "Liderança Situacional",
      "Governança Corporativa e ética", "Análise de riscos financeiros", "Responsabilidade Social Corporativa (CSR) e ESG",
      "Negociação avançada", "Mediação de conflitos e arbitragem", "Propriedade Intelectual", "Direito Contratual básico",
      "Diversidade, Equidade e Inclusão (DEI)", "Psicologia Organizacional", "Estratégias de Marketing Global vs. Local",
      "Neuromarketing", "Tecnologias Disruptivas e Transformação Digital", "Cibersegurança e proteção de dados",
      "Logística Global e Supply Chain", "Metodologias Ágeis vs. Tradicionais", "Empreendedorismo e estratégias de saída",
      "Venture Capital e Angel Investing", "Comunicação Intercultural avançada", "Storytelling para negócios",
      "Retórica e persuasão", "Gestão de Talentos", "Economia Global", "Sustentabilidade Financeira",
      "Networking Estratégico", "Franquias e licenciamento", "Eufemismos corporativos",
      "Expressões Idiomáticas de alto nível e jargão"
    ],
    [Theme.Reading]: [...GRAMMAR_C1, ...VOCAB_C1]
  }
};
