/**
 * Os textos de ajuda dos blocos, num arquivo só.
 *
 * Três linhas por bloco, sempre as mesmas três: o que o bloco mostra, como ler
 * o que está ali e o que dá para clicar. Quem abre o "?" não está lendo um
 * manual — está no meio de um turno, com uma dúvida pontual, e quer a resposta
 * em cinco segundos.
 *
 * Os textos moram aqui, e não ao lado de cada painel, por dois motivos: dá para
 * ler todos de uma vez e perceber que dois blocos explicam a mesma coisa de
 * jeitos diferentes, e dá para um teste cobrar que nenhum painel ficou sem.
 *
 * A chave é `tela.bloco`. `HelpKey` sai daqui, então painel com chave inventada
 * não compila.
 */

export interface BlockHelp {
  /** O que o bloco mostra. Uma frase. */
  readonly shows: string;
  /** Como ler o que está ali: a convenção que não é óbvia à primeira vista. */
  readonly read: string;
  /** O que dá para clicar — ou que não há clique nenhum, quando é o caso. */
  readonly click: string;
}

export const HELP = {
  // Turno

  'turno.linha-do-tempo': {
    shows:
      'Velocidade, produção acumulada e as bobinas do turno no mesmo eixo de horas, com os eventos marcados em cima.',
    read: 'A faixa vermelha é o tempo parado por quebra. A área mais clara à direita ainda não aconteceu. A produção é a integral de XI-0001, então ela anda durante a bobina em curso.',
    click:
      'Um evento abre o que ele é; uma bobina abre a tela de Bobinas. Os botões à direita trocam a janela.',
  },
  'turno.placar': {
    shows: 'Produção, eficiência, quebras e refugo do turno, até agora.',
    read: 'Na produção, a barra é o acumulado e o traço é o ritmo da meta neste instante: atrás do traço, o turno está devendo. Refugo e eficiência têm a meta marcada na própria barra.',
    click: 'Nada aqui é clicável: é leitura.',
  },
  'turno.alarmes': {
    shows: 'Os alarmes em pé, um por TAG, do mais grave para o mais antigo.',
    read: 'O quadradinho é a prioridade, sendo 1 a pior. Ao lado vem há quanto tempo o alarme está em pé e onde o PV está na faixa.',
    click: 'Clicar no alarme abre a tendência daquela TAG em Processo.',
  },
  'turno.passagem': {
    shows:
      'O que fica para o próximo turno: bobina retida, nota aberta, ponto de ronda com achado e o que o turno anotou.',
    read: 'Cada linha diz de onde a pendência veio. A contagem no alto é o que ainda não foi marcado.',
    click:
      'A caixinha risca a pendência só na tua tela, não manda nada para a API. Onde há nota ou TAG, a linha abre o registro.',
  },

  // Processo

  'processo.variaveis': {
    shows: 'As variáveis da seção escolhida: faixa, PV, setpoint e a última hora.',
    read: 'Na barra, a parte clara é a faixa L–H e as marcas altas são LL e HH; a barra vertical é o PV e o triângulo é o SP. Fora da faixa, o PV ganha a cor da prioridade.',
    click:
      'Clicar numa linha põe a TAG na tendência ao lado. "Só fora da faixa" esconde o que está em ordem.',
  },
  'processo.tendencia': {
    shows: 'Até quatro TAGs no mesmo eixo de tempo, cada uma na sua faixa.',
    read: 'Cada faixa tem escala própria — as curvas não se comparam entre si. A banda clara é L–H, a marca azul é uma alteração de setpoint e a colorida é alarme.',
    click: 'O × tira a TAG. Os botões escolhem a janela; a tela mostra o que a fonte cobrir.',
  },
  'processo.setpoint': {
    shows: 'A escrita de setpoint da malha escolhida e o histórico da seção.',
    read: 'O motivo é obrigatório e fica gravado com quem escreveu e quando. Malha escrava de cascata e modo de demonstração não aceitam escrita, e a tela diz por quê.',
    click:
      'Escrever grava de verdade na simulação. "Simular esta malha" abre a tela de Simulação com ela, para ver a resposta antes. O histórico abaixo é só leitura.',
  },
  'processo.refino': {
    shows:
      'A energia de refino das últimas horas e, embaixo, o que o laboratório mediu nas bobinas do período.',
    read: 'As duas faixas têm escalas diferentes: o que vale é o formato, não a altura. O efeito do refino é lento — minutos entre mexer e aparecer na folha.',
    click: 'Nada aqui é clicável: é leitura.',
  },

  // Simulação

  'simulacao.entrada': {
    shows: 'A proposta: até quatro malhas, o valor novo de cada uma, o modo e o horizonte.',
    read: '"Agora" é onde a máquina está; o controle deslizante vai de ponta a ponta da faixa da válvula. A lista de malhas muda com o modo, porque em cascata o setpoint é do mestre e a válvula é da escrava.',
    click:
      'Qualquer mudança recalcula sozinha. "Aplicar no processo" não escreve: leva a proposta para o painel de setpoint, em Processo.',
  },
  'simulacao.curvas': {
    shows:
      'Uma curva por variável alcançada, todas no mesmo eixo de tempo, com a leitura em palavras no alto.',
    read: 'A cinza é o que aconteceria sem mexer e a azul é a proposta; o que importa é a distância entre as duas. O tracejado vertical é o tempo morto, o ▾ é o 63 % e a linha vermelha é onde a previsão cruza um limite.',
    click:
      '"Comparar modos" desenha automático e manual juntos, e o espaço entre eles é o que a malha faz. Clicar numa faixa destaca essa variável.',
  },
  'simulacao.efeitos': {
    shows: 'O número de cada variável alcançada e por onde o efeito chegou nela.',
    read: 'Δ fim é a variação no fim do horizonte e o pico é o maior desvio no meio — em automático a malha devolve a variável, e aí só o pico conta o que aconteceu. O caminho sai do grafo de relações do simulador.',
    click: 'Clicar numa linha destaca o gráfico dela e mostra a cadeia de causa e efeito abaixo.',
  },

  // Laboratório

  'laboratorio.matriz': {
    shows: 'As últimas bobinas fechadas contra cada ensaio do laboratório.',
    read: 'O ponto fica onde o resultado caiu dentro da especificação, e nos 10 % das pontas ele vira "no limite". Vazio é ensaio que não era daquela bobina; contorno é ensaio atrasado.',
    click: 'Clicar no nome do ensaio abre a carta de controle dele ao lado.',
  },
  'laboratorio.carta': {
    shows: 'A carta de controle do ensaio escolhido, bobina a bobina.',
    read: 'LSC e LIC são a média ± 3σ de uma base que deixa as cinco últimas bobinas de fora — senão o desvio recente alargaria o próprio limite. O Cpk sai da mesma base.',
    click: 'Nada aqui é clicável: a escolha do ensaio é na matriz ao lado.',
  },
  'laboratorio.fila': {
    shows: 'Os ensaios que passaram do prazo e os que estão por vir.',
    read: 'A barra é tempo decorrido contra prazo. "Na fila" é bobina ainda em formação, com a troca prevista pela mediana das últimas.',
    click: 'Nada aqui é clicável: é leitura.',
  },
  'laboratorio.lab-qcs': {
    shows: 'O que o laboratório mediu contra o que o scanner mediu na mesma bobina.',
    read: 'O ponto cheio é o laboratório e o vazado é a média do QCS na janela da bobina. A banda é o quanto de diferença ainda é normal entre os dois métodos.',
    click: 'Nada aqui é clicável: é leitura.',
  },

  // Bobinas

  'bobinas.lista': {
    shows: 'Uma faixa por bobina jumbo do dia, no comprimento que ela tem.',
    read: 'A parte escura é o papel dentro da tolerância do QCS e a clara é o que saiu dela. O traço vertical é quebra. A bobina em formação tem o comprimento estimado por tempo × velocidade.',
    click: 'Clicar na faixa abre a bobina nos painéis ao lado.',
  },
  'bobinas.mapa': {
    shows: 'A umidade da bobina escolhida ao longo da largura e do comprimento.',
    read: 'Cada coluna é uma posição na largura e cada linha é um trecho da bobina. A escala sai da média e do 2σ CD reais da bobina.',
    click: 'Nada aqui é clicável: é leitura.',
  },
  'bobinas.perfil': {
    shows: 'Gramatura, umidade e espessura da bobina ao longo do comprimento.',
    read: 'A linha é a média na largura, a cada instante. A banda é a tolerância da TAG e o número à direita é a média da bobina inteira.',
    click: 'Nada aqui é clicável: é leitura.',
  },

  // Mancais

  'mancais.ranking': {
    shows: 'Os mancais monitorados, do pior para o melhor.',
    read: 'A ordem é a vibração dividida pela fronteira C→D do próprio mancal, o que deixa comparar mancais de classes diferentes. A barra mostra as quatro zonas da ISO 20816-3 e o traço é o valor no início da janela.',
    click:
      'Clicar escolhe o mancal nos painéis ao lado. "Mostrar todos" abre os que estão em ordem.',
  },
  'mancais.detalhe': {
    shows: 'A vibração e a temperatura do mancal escolhido, na janela que a API devolve.',
    read: 'As faixas de fundo são as zonas da ISO. A linha pontilhada é projeção da tendência, e ela só aparece quando a inclinação passa do próprio ruído do ajuste. Rolamento degrada acelerando, então a data real chega antes da projetada.',
    click: 'As marcas na linha do tempo abrem a nota e a ronda daquele ponto.',
  },
  'mancais.mapa': {
    shows:
      'A máquina de lado, com um ponto por mancal: a faixa de cima é o lado comando e a de baixo o lado acionamento.',
    read: 'O ponto tem a cor da zona da ISO, a mesma da lista ao lado; tracejado é mancal sem leitura. O comprimento é a posição real na máquina; a altura é esticada, senão as duas fileiras de secadores se sobrepõem.',
    click:
      '"Ver em 3D" troca o mapa pela cena, e é só aí que o 3D é baixado. O mancal escolhido na lista aparece destacado aqui.',
  },

  // Rondas

  'rondas.roteiro': {
    shows: 'Os pontos da ronda escolhida, na ordem em que foram percorridos.',
    read: 'Cada cartão compara a leitura de campo com o valor online do mesmo instante, na mesma escala. "Achado" é divergência, ruído anormal ou vazamento.',
    click: 'Clicar no cartão abre o ponto em detalhe embaixo.',
  },
  'rondas.ponto': {
    shows:
      'O ponto escolhido: campo contra online, a observação de quem passou e o que isso gerou.',
    read: 'O pirômetro de campo lê a carcaça alguns graus abaixo do sensor do mancal; o esperado já conta com isso, e só vira achado o que passa da folga.',
    click: 'Os botões levam à nota, à tendência da TAG e ao mancal em Mancais.',
  },
  'rondas.lista': {
    shows:
      'As rondas do turno em curso, ou as mais recentes quando o turno ainda não teve nenhuma.',
    read: 'Os pontinhos resumem a ronda: um por ponto, marcado quando houve achado. À direita, quantos achados viraram nota.',
    click: 'Clicar troca a ronda mostrada no roteiro acima.',
  },

  // Notas

  'notas.quadro': {
    shows: 'As notas de manutenção em quatro colunas, pela situação de cada uma.',
    read: 'A cor da borda de cima é a prioridade, de 1 (parada imediata) a 4 (quando houver oportunidade). "PARADA" é nota que exige máquina parada.',
    click: 'Clicar no cartão abre a nota ao lado.',
  },
  'notas.detalhe': {
    shows: 'A nota escolhida: equipamento, sintoma, prioridade e o sinal que a originou.',
    read: 'O gráfico é a evidência da nota — a vibração do mancal sobre as zonas da ISO, ou a tendência da TAG com a faixa L–H —, com a nota marcada no instante em que nasceu.',
    click: 'As evidências levam ao registro de onde vieram: o alarme, a ronda, a tendência.',
  },
} as const satisfies Record<string, BlockHelp>;

export type HelpKey = keyof typeof HELP;

/** As três linhas de um bloco. */
export function helpOf(key: HelpKey): BlockHelp {
  return HELP[key];
}

/** Todas as chaves, na ordem em que estão escritas. */
export const HELP_KEYS = Object.keys(HELP) as readonly HelpKey[];
