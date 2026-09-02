# ÓRBITA — Scanner 3D com a câmera do telefone

Aplicativo web instalável (PWA) que transforma a câmera do celular em um scanner de fotogrametria: você orbita um objeto capturando quadros e o app reconstrói um **modelo 3D real, visível de todos os ângulos** — silhueta esculpida por *visual hull*, textura 360° costurada, nuvem de pontos colorida e malha com relevo — com visualização interativa e exportação `.GLB`.

## Como o modelo é reconstruído

1. **Equalização** — brilho dos quadros é normalizado;
2. **Reconhecimento do objeto** — flood-fill remove o fundo e componentes conectados descartam interferências (mãos, objetos ao fundo, reflexos); a silhueta resultante vira o **raio do volume** em cada altura/ângulo (visual hull);
3. **Textura 360°** — as vistas são reprojetadas e costuradas com blend (reprojeição cilíndrica com zona de sobreposição);
4. **Nuvem de pontos** — ~12 mil amostras coloridas projetadas na superfície do hull;
5. **Malha + relevo** — grade angular 96×72 com o perfil do hull e micro-relevo esculpido pela luminância da textura (ajustável ao vivo no visualizador).

Sem silhueta confiável (fundo confuso), o app cai num fallback cilíndrico e avisa no log.

## Rodando localmente

```bash
npm install
npm run dev          # http://localhost:5173 (câmera liberada)
```

Para acessar pelo celular na mesma rede:

```bash
npm run dev -- --host
# abra a URL "Network" no Chrome do celular
```

> ⚠️ A câmera do navegador **exige HTTPS**. Na rede local, crie um túnel:
> `npx cloudflared tunnel --url http://localhost:5173` e abra a URL `https://` resultante.

## Deploy na Vercel

O projeto inclui `vercel.json` com as configurações travadas (Vite, build `npm run build`, saída `dist`). Conecte o repositório em [vercel.com/new](https://vercel.com/new) — cada push gera um deploy. Com HTTPS ativo, câmera e instalação como app funcionam imediatamente.

## Instalando no Android

1. Abra a URL **HTTPS** no Chrome;
2. Menu **⋮ → Instalar app** (ou *Adicionar à tela inicial*);
3. O ícone entra na gaveta de apps e abre em tela cheia.

## Estrutura

```
src/
├── App.tsx                  # shell, estágios (scan → reconstrução → modelo), galeria
├── components/
│   ├── Scanner.tsx          # HUD da câmera + captura com rajada
│   ├── Processing.tsx       # etapas + console de log alimentados pelo pipeline
│   ├── Viewer.tsx           # cena Three.js, modos, relevo ao vivo, exportação GLB/PNG
│   └── Icons.tsx            # biblioteca de ícones SVG própria
└── lib/
    ├── pipeline.ts          # visual hull + textura 360° + malha + pontos
    ├── demo.ts              # vaso sintético (12 vistas em turntable)
    └── storage.ts           # persistência da galeria
```

## Dicas de captura

- Gire **o objeto** (base giratória ou na mão), telefone parado;
- Fundo liso, neutro e bem iluminado → silhueta perfeita;
- Luz difusa, sem sombras duras; 12–24 quadros.
