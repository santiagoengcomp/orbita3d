# Próxima rodada de melhorias — Órbita 3D

Ordem sugerida, do maior impacto para o menor:

1. Captura automática por estabilidade: disparar somente quando foco, exposição e movimento estiverem adequados.
2. Validação de cobertura em tempo real: mapa 360° indicando ângulos faltantes antes de liberar a reconstrução.
3. Recaptura seletiva: pedir novamente apenas as fotos desfocadas ou que não alinharam no COLMAP.
4. Modelos de segmentação especializados e configuráveis para objeto, cabeça/rosto, cabelo e corpo/roupa.
5. Calibração de escala: usar cartão, régua ou marcador ArUco para exportar o modelo em centímetros reais.
6. Refinamento facial: landmarks para proteger olhos, nariz, boca e orelhas durante limpeza da malha.
7. Refinamento corporal: detecção de pose para validar braços separados do tronco e distância entre pernas.
8. Remoção automática de chão, pedestal e pequenos componentes flutuantes após a malha.
9. Preenchimento de buracos guiado por curvatura, preservando cavidades verdadeiras do objeto.
10. Otimização GLB: níveis de detalhe, compressão Draco/Meshopt e texturas KTX2 para celular.
11. Editor pós-processamento: recorte, rotação, escala, suavização e correção simples de textura.
12. Fila e retomada de trabalhos: reconstrução persistente após fechar ou recarregar o navegador.
13. Exportações adicionais: OBJ/MTL, PLY e STL, além do GLB atual.
14. Testes com conjuntos públicos de fotogrametria e métricas de cobertura, completude e erro geométrico.
15. Empacotamento instalável com diagnóstico automático dos motores e atualização segura.
