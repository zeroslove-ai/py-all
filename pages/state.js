// state.js — 단순 상태 객체 (프레임워크 없이)

const state = {
  // ─── 게임 상태 ───
  gameId: null,
  turnCount: 0,
  imageCatalog: {},
  lastExtract: null,

  // ─── UI 상태 ───
  isStreaming: false,
  autoTts: true,
  pendingResetConfirm: false,

  // ─── 렌더링 상태 ───
  narrativeText: '',
  imageUrl: '',
  audioUrl: '',
  npcStats: {},
  choices: []
};

// ─── 상태 변경 감시 (선택적) ───
// 필요시 Proxy나 이벤트 기반으로 확장
// 현재는 직접 할당 후 ui.update*() 호출
