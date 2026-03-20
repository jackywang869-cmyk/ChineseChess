(() => {
  /**
   * Xiangqi (Chinese Chess) - pure front-end.
   * Board: 10 rows x 9 cols.
   * Pieces: r/b + type (k,a,b,n,r,c,p)  => king/advisor/elephant/horse/rook/cannon/pawn
   */

  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("board"));
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));

  const elStatus = document.getElementById("statusText");
  const elTurn = document.getElementById("turnText");
  const elState = document.getElementById("stateText");
  const elMove = document.getElementById("moveText");
  const elMovesList = /** @type {HTMLOListElement} */ (document.getElementById("movesList"));

  const btnNew = /** @type {HTMLButtonElement} */ (document.getElementById("btnNew"));
  const btnUndo = /** @type {HTMLButtonElement} */ (document.getElementById("btnUndo"));

  const modeSelect = /** @type {HTMLSelectElement} */ (document.getElementById("modeSelect"));
  const humanSideSelect = /** @type {HTMLSelectElement} */ (document.getElementById("humanSideSelect"));
  const aiLevelSelect = /** @type {HTMLSelectElement} */ (document.getElementById("aiLevelSelect"));

  const DPR = Math.max(1, Math.floor(window.devicePixelRatio || 1));

  /** @typedef {"r"|"b"} Side */
  /** @typedef {"k"|"a"|"b"|"n"|"r"|"c"|"p"} PieceType */
  /** @typedef {{s:Side,t:PieceType}} Piece */
  /** @typedef {Piece|null} Cell */
  /** @typedef {{fr:number,fc:number,tr:number,tc:number,capture:Piece|null, moved:Piece, notation:string}} Move */

  const PIECE_TEXT = {
    r: { k: "帥", a: "仕", b: "相", n: "傌", r: "俥", c: "炮", p: "兵" },
    b: { k: "將", a: "士", b: "象", n: "馬", r: "車", c: "砲", p: "卒" },
  };

  const settings = {
    mode: /** @type {"pvp"|"ai"} */ ("pvp"),
    human: /** @type {Side} */ ("r"),
    aiLevel: /** @type {"beginner"|"easy"|"normal"|"hard"|"master"} */ ("normal"),
  };

  /** @type {Cell[][]} */
  let board = [];
  /** @type {Side} */
  let turn = "r";
  /** @type {Move[]} */
  let history = [];
  let selected = /** @type {{r:number,c:number}|null} */ (null);
  /** @type {{r:number,c:number}[]} */
  let legalTargets = [];
  let aiThinking = false;

  const geom = {
    padX: 36,
    padY: 40,
    cell: 68,
    innerW: 0,
    innerH: 0,
    riverY: 0,
    originX: 0,
    originY: 0,
  };

  function clonePiece(p) {
    return p ? { s: p.s, t: p.t } : null;
  }

  function inBounds(r, c) {
    return r >= 0 && r < 10 && c >= 0 && c < 9;
  }

  function other(side) {
    return side === "r" ? "b" : "r";
  }

  function isHumanTurn() {
    if (settings.mode !== "ai") return true;
    return turn === settings.human;
  }

  function init() {
    settings.mode = modeSelect.value === "ai" ? "ai" : "pvp";
    settings.human = humanSideSelect.value === "b" ? "b" : "r";
    settings.aiLevel =
      aiLevelSelect.value === "beginner"
        ? "beginner"
        : aiLevelSelect.value === "easy"
          ? "easy"
          : aiLevelSelect.value === "hard"
            ? "hard"
            : aiLevelSelect.value === "master"
              ? "master"
              : "normal";

    board = startingPosition();
    turn = "r";
    history = [];
    selected = null;
    legalTargets = [];
    aiThinking = false;

    syncControls();
    resizeCanvas();
    syncUI();
    draw();
    maybeAiMove();
  }

  function syncControls() {
    const on = settings.mode === "ai";
    humanSideSelect.disabled = !on;
    aiLevelSelect.disabled = !on;
  }

  function startingPosition() {
    /** @type {Cell[][]} */
    const b = Array.from({ length: 10 }, () => Array.from({ length: 9 }, () => null));
    const place = (r, c, s, t) => (b[r][c] = /** @type {Piece} */ ({ s, t }));

    // Black (top)
    place(0, 0, "b", "r"); place(0, 1, "b", "n"); place(0, 2, "b", "b"); place(0, 3, "b", "a");
    place(0, 4, "b", "k"); place(0, 5, "b", "a"); place(0, 6, "b", "b"); place(0, 7, "b", "n"); place(0, 8, "b", "r");
    place(2, 1, "b", "c"); place(2, 7, "b", "c");
    place(3, 0, "b", "p"); place(3, 2, "b", "p"); place(3, 4, "b", "p"); place(3, 6, "b", "p"); place(3, 8, "b", "p");

    // Red (bottom)
    place(9, 0, "r", "r"); place(9, 1, "r", "n"); place(9, 2, "r", "b"); place(9, 3, "r", "a");
    place(9, 4, "r", "k"); place(9, 5, "r", "a"); place(9, 6, "r", "b"); place(9, 7, "r", "n"); place(9, 8, "r", "r");
    place(7, 1, "r", "c"); place(7, 7, "r", "c");
    place(6, 0, "r", "p"); place(6, 2, "r", "p"); place(6, 4, "r", "p"); place(6, 6, "r", "p"); place(6, 8, "r", "p");

    return b;
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.floor(rect.width);
    const cssH = Math.floor((cssW * 840) / 760); // keep aspect similar
    const pxW = cssW * DPR;
    const pxH = cssH * DPR;
    canvas.width = pxW;
    canvas.height = pxH;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(DPR, DPR);

    const padX = Math.max(22, Math.floor(cssW * 0.06));
    const padY = Math.max(24, Math.floor(cssH * 0.055));
    const innerW = cssW - padX * 2;
    const innerH = cssH - padY * 2;
    const cell = Math.min(innerW / 8, innerH / 9);
    geom.padX = padX;
    geom.padY = padY;
    geom.cell = cell;
    geom.innerW = cell * 8;
    geom.innerH = cell * 9;
    geom.originX = Math.floor((cssW - geom.innerW) / 2);
    geom.originY = Math.floor((cssH - geom.innerH) / 2);
    geom.riverY = geom.originY + geom.cell * 4.5;
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    ctx.clearRect(0, 0, W, H);
    drawBoard(W, H);
    drawHighlights();
    drawPieces();
  }

  function drawBoard(W, H) {
    // subtle vignette
    const g = ctx.createRadialGradient(W * 0.5, H * 0.45, Math.min(W, H) * 0.15, W * 0.5, H * 0.55, Math.min(W, H) * 0.62);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.14)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const { originX, originY, cell } = geom;
    const x0 = originX;
    const y0 = originY;
    const x1 = originX + cell * 8;
    const y1 = originY + cell * 9;

    ctx.strokeStyle = "rgba(30,18,8,0.55)";
    ctx.lineWidth = Math.max(1.1, cell * 0.018);
    ctx.lineCap = "round";

    // Outer border
    ctx.beginPath();
    ctx.rect(x0, y0, cell * 8, cell * 9);
    ctx.stroke();

    // Vertical lines (with river gap)
    for (let c = 0; c < 9; c++) {
      const x = x0 + cell * c;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + cell * 4);
      ctx.moveTo(x, y0 + cell * 5);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }

    // Horizontal lines
    for (let r = 0; r < 10; r++) {
      const y = y0 + cell * r;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }

    // Palaces diagonals
    drawPalaceDiagonals();

    // River text
    ctx.save();
    ctx.fillStyle = "rgba(30,18,8,0.42)";
    ctx.font = `700 ${Math.max(16, Math.floor(cell * 0.42))}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("楚 河", x0 + cell * 2, y0 + cell * 4.5);
    ctx.fillText("漢 界", x0 + cell * 6, y0 + cell * 4.5);
    ctx.restore();

    // Notches (simple)
    drawNotches();
  }

  function drawPalaceDiagonals() {
    const { originX, originY, cell } = geom;
    const stroke = "rgba(30,18,8,0.55)";
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1.1, cell * 0.018);

    // Top palace (rows 0-2, cols 3-5)
    ctx.beginPath();
    ctx.moveTo(originX + cell * 3, originY + cell * 0);
    ctx.lineTo(originX + cell * 5, originY + cell * 2);
    ctx.moveTo(originX + cell * 5, originY + cell * 0);
    ctx.lineTo(originX + cell * 3, originY + cell * 2);
    ctx.stroke();

    // Bottom palace (rows 7-9, cols 3-5)
    ctx.beginPath();
    ctx.moveTo(originX + cell * 3, originY + cell * 7);
    ctx.lineTo(originX + cell * 5, originY + cell * 9);
    ctx.moveTo(originX + cell * 5, originY + cell * 7);
    ctx.lineTo(originX + cell * 3, originY + cell * 9);
    ctx.stroke();
  }

  function drawNotches() {
    const { originX, originY, cell } = geom;
    const notch = Math.max(6, cell * 0.12);
    ctx.strokeStyle = "rgba(30,18,8,0.45)";
    ctx.lineWidth = Math.max(1, cell * 0.016);

    const mark = (r, c) => {
      const x = originX + cell * c;
      const y = originY + cell * r;
      const seg = (dx, dy, sx, sy) => {
        ctx.beginPath();
        ctx.moveTo(x + sx, y + sy);
        ctx.lineTo(x + sx + dx, y + sy + dy);
        ctx.stroke();
      };
      // 4 corner Ls around intersection (simplified)
      seg(-notch, 0, -notch * 0.2, -notch * 0.7);
      seg(0, -notch, -notch * 0.7, -notch * 0.2);
      seg(notch, 0, notch * 0.2, -notch * 0.7);
      seg(0, -notch, notch * 0.7, -notch * 0.2);
      seg(-notch, 0, -notch * 0.2, notch * 0.7);
      seg(0, notch, -notch * 0.7, notch * 0.2);
      seg(notch, 0, notch * 0.2, notch * 0.7);
      seg(0, notch, notch * 0.7, notch * 0.2);
    };

    // Cannon/pawn starting marker intersections
    const pts = [
      { r: 2, c: 1 }, { r: 2, c: 7 },
      { r: 7, c: 1 }, { r: 7, c: 7 },
      { r: 3, c: 0 }, { r: 3, c: 2 }, { r: 3, c: 4 }, { r: 3, c: 6 }, { r: 3, c: 8 },
      { r: 6, c: 0 }, { r: 6, c: 2 }, { r: 6, c: 4 }, { r: 6, c: 6 }, { r: 6, c: 8 },
    ];
    for (const p of pts) mark(p.r, p.c);
  }

  function cellCenter(r, c) {
    return {
      x: geom.originX + geom.cell * c,
      y: geom.originY + geom.cell * r,
    };
  }

  function drawHighlights() {
    const rPiece = Math.max(16, geom.cell * 0.38);
    if (selected) {
      const { x, y } = cellCenter(selected.r, selected.c);
      ctx.save();
      ctx.strokeStyle = "rgba(124,92,255,0.95)";
      ctx.lineWidth = Math.max(2, geom.cell * 0.06);
      ctx.beginPath();
      ctx.arc(x, y, rPiece * 0.78, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (legalTargets.length) {
      ctx.save();
      for (const t of legalTargets) {
        const { x, y } = cellCenter(t.r, t.c);
        ctx.fillStyle = "rgba(48,213,200,0.20)";
        ctx.beginPath();
        ctx.arc(x, y, rPiece * 0.38, 0, Math.PI * 2);
        ctx.fill();
        const targetPiece = board[t.r][t.c];
        if (targetPiece) {
          ctx.strokeStyle = "rgba(255,91,110,0.85)";
          ctx.lineWidth = Math.max(2, geom.cell * 0.05);
          ctx.beginPath();
          ctx.arc(x, y, rPiece * 0.72, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  function drawPieces() {
    const rPiece = Math.max(18, geom.cell * 0.40);
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = board[r][c];
        if (!p) continue;
        const { x, y } = cellCenter(r, c);
        drawPiece(x, y, rPiece, p);
      }
    }
  }

  function drawPiece(x, y, r, p) {
    ctx.save();
    // shadow
    ctx.beginPath();
    ctx.arc(x, y + r * 0.07, r * 1.02, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fill();

    // body
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r * 1.2);
    g.addColorStop(0, "rgba(255,255,255,0.98)");
    g.addColorStop(0.55, "rgba(235,238,244,0.98)");
    g.addColorStop(1, "rgba(206,210,219,1)");
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.14)";
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.stroke();

    // text
    ctx.fillStyle = p.s === "r" ? "rgba(210,35,60,0.98)" : "rgba(25,25,25,0.92)";
    ctx.font = `900 ${Math.floor(r * 0.82)}px "Noto Serif TC", "PingFang TC", "Microsoft JhengHei", serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(PIECE_TEXT[p.s][p.t], x, y + r * 0.03);
    ctx.restore();
  }

  function canvasToCell(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const c = Math.round((x - geom.originX) / geom.cell);
    const r = Math.round((y - geom.originY) / geom.cell);
    return { r, c };
  }

  function syncUI() {
    const turnText = turn === "r" ? "紅" : "黑";
    const state = gameState();
    elTurn.textContent = turnText;
    elMove.textContent = String(history.length);
    elState.textContent = state.label;
    btnUndo.disabled = history.length === 0 || aiThinking;

    if (state.kind === "checkmate") {
      elStatus.textContent = `將死：${state.winner === "r" ? "紅勝" : "黑勝"}（按「新對局」再來）`;
    } else if (state.kind === "stalemate") {
      elStatus.textContent = "和棋（無子可走）";
    } else if (state.kind === "check") {
      elStatus.textContent = `將軍！輪到：${turnText}`;
    } else {
      if (settings.mode === "ai" && !isHumanTurn()) {
        elStatus.textContent = aiThinking ? "AI 思考中…" : "輪到：AI";
      } else {
        elStatus.textContent = `輪到：${turnText}`;
      }
    }

    renderMovesList();
  }

  function renderMovesList() {
    elMovesList.innerHTML = "";
    for (let i = 0; i < history.length; i += 2) {
      const li = document.createElement("li");
      const a = history[i];
      const b = history[i + 1];
      li.textContent = `${Math.floor(i / 2) + 1}. ${a ? a.notation : ""}${b ? "    " + b.notation : ""}`;
      elMovesList.appendChild(li);
    }
  }

  function gameState() {
    const inCheck = isInCheck(turn);
    const moves = generateLegalMoves(turn);
    if (moves.length === 0) {
      if (inCheck) return { kind: "checkmate", winner: other(turn), label: "將死" };
      return { kind: "stalemate", winner: null, label: "無子可走" };
    }
    if (inCheck) return { kind: "check", winner: null, label: "被將軍" };
    return { kind: "normal", winner: null, label: "進行中" };
  }

  // ===== Move generation (pseudo-legal) =====

  function palaceContains(side, r, c) {
    if (c < 3 || c > 5) return false;
    if (side === "b") return r >= 0 && r <= 2;
    return r >= 7 && r <= 9;
  }

  function riverCrossed(side, r) {
    // pawns: red crosses when r <= 4; black crosses when r >= 5
    return side === "r" ? r <= 4 : r >= 5;
  }

  function kingPos(side) {
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p && p.s === side && p.t === "k") return { r, c };
    }
    return null;
  }

  function isInCheck(side) {
    const kp = kingPos(side);
    if (!kp) return false;
    const enemy = other(side);
    // If enemy can capture king with any pseudo move => check.
    const attacks = generatePseudoMoves(enemy, true);
    return attacks.some((m) => m.tr === kp.r && m.tc === kp.c);
  }

  function generateLegalMoves(side) {
    const pseudo = generatePseudoMoves(side, false);
    /** @type {Move[]} */
    const legal = [];
    for (const m of pseudo) {
      doMove(m);
      const ok = !isInCheck(side) && !kingsFacing();
      undoMove();
      if (ok) legal.push(m);
    }
    return legal;
  }

  function kingsFacing() {
    const kr = kingPos("r");
    const kb = kingPos("b");
    if (!kr || !kb) return false;
    if (kr.c !== kb.c) return false;
    const c = kr.c;
    const r0 = Math.min(kr.r, kb.r) + 1;
    const r1 = Math.max(kr.r, kb.r) - 1;
    for (let r = r0; r <= r1; r++) if (board[r][c]) return false;
    return true;
  }

  function generatePseudoMoves(side, forAttack) {
    /** @type {Move[]} */
    const moves = [];
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (!p || p.s !== side) continue;
      genPieceMoves(r, c, p, moves, forAttack);
    }
    return moves;
  }

  function addMove(fr, fc, tr, tc, p, list) {
    const cap = board[tr][tc];
    if (cap && cap.s === p.s) return;
    const notation = simpleNotation(fr, fc, tr, tc, p, cap);
    list.push({ fr, fc, tr, tc, capture: cap ? clonePiece(cap) : null, moved: clonePiece(p), notation });
  }

  function simpleNotation(fr, fc, tr, tc, p, cap) {
    const from = `${PIECE_TEXT[p.s][p.t]}${9 - fc}${10 - fr}`;
    const to = `${9 - tc}${10 - tr}`;
    return cap ? `${from}×${to}` : `${from}-${to}`;
  }

  function genPieceMoves(r, c, p, out, forAttack) {
    switch (p.t) {
      case "k": return genKing(r, c, p, out);
      case "a": return genAdvisor(r, c, p, out);
      case "b": return genElephant(r, c, p, out);
      case "n": return genHorse(r, c, p, out);
      case "r": return genRook(r, c, p, out);
      case "c": return genCannon(r, c, p, out, forAttack);
      case "p": return genPawn(r, c, p, out);
    }
  }

  function genKing(r, c, p, out) {
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dr, dc] of dirs) {
      const rr = r + dr, cc = c + dc;
      if (!inBounds(rr, cc)) continue;
      if (!palaceContains(p.s, rr, cc)) continue;
      addMove(r, c, rr, cc, p, out);
    }
    // Flying general capture (line of sight)
    const enemyK = kingPos(other(p.s));
    if (enemyK && enemyK.c === c) {
      let blocked = false;
      const step = enemyK.r > r ? 1 : -1;
      for (let rr = r + step; rr !== enemyK.r; rr += step) {
        if (board[rr][c]) { blocked = true; break; }
      }
      if (!blocked) addMove(r, c, enemyK.r, enemyK.c, p, out);
    }
  }

  function genAdvisor(r, c, p, out) {
    const deltas = [[1,1],[1,-1],[-1,1],[-1,-1]];
    for (const [dr, dc] of deltas) {
      const rr = r + dr, cc = c + dc;
      if (!inBounds(rr, cc)) continue;
      if (!palaceContains(p.s, rr, cc)) continue;
      addMove(r, c, rr, cc, p, out);
    }
  }

  function genElephant(r, c, p, out) {
    const deltas = [[2,2],[2,-2],[-2,2],[-2,-2]];
    for (const [dr, dc] of deltas) {
      const rr = r + dr, cc = c + dc;
      if (!inBounds(rr, cc)) continue;
      // cannot cross river
      if (p.s === "r" && rr < 5) continue;
      if (p.s === "b" && rr > 4) continue;
      // elephant eye
      const mr = r + dr / 2, mc = c + dc / 2;
      if (board[mr][mc]) continue;
      addMove(r, c, rr, cc, p, out);
    }
  }

  function genHorse(r, c, p, out) {
    const steps = [
      { dr: -2, dc: -1, br: -1, bc: 0 },
      { dr: -2, dc: 1, br: -1, bc: 0 },
      { dr: 2, dc: -1, br: 1, bc: 0 },
      { dr: 2, dc: 1, br: 1, bc: 0 },
      { dr: -1, dc: -2, br: 0, bc: -1 },
      { dr: 1, dc: -2, br: 0, bc: -1 },
      { dr: -1, dc: 2, br: 0, bc: 1 },
      { dr: 1, dc: 2, br: 0, bc: 1 },
    ];
    for (const s of steps) {
      const rr = r + s.dr, cc = c + s.dc;
      if (!inBounds(rr, cc)) continue;
      const br = r + s.br, bc = c + s.bc;
      if (board[br][bc]) continue;
      addMove(r, c, rr, cc, p, out);
    }
  }

  function genRook(r, c, p, out) {
    slide(r, c, p, out, [[1,0],[-1,0],[0,1],[0,-1]], false);
  }

  function genCannon(r, c, p, out, forAttack) {
    // Like rook for movement, but capture requires exactly one screen between.
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      // non-capture moves until first piece
      while (inBounds(rr, cc) && !board[rr][cc]) {
        addMove(r, c, rr, cc, p, out);
        rr += dr; cc += dc;
      }
      // find screen then capture
      rr += dr; cc += dc;
      while (inBounds(rr, cc)) {
        const t = board[rr][cc];
        if (t) {
          // capture any enemy piece
          if (t.s !== p.s) addMove(r, c, rr, cc, p, out);
          break;
        }
        rr += dr; cc += dc;
      }
    }
    // forAttack is same as normal for cannon (captures are attacks); nothing special needed
    void forAttack;
  }

  function slide(r, c, p, out, dirs, stopAtCapture) {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (inBounds(rr, cc)) {
        const t = board[rr][cc];
        if (!t) {
          addMove(r, c, rr, cc, p, out);
        } else {
          if (t.s !== p.s) addMove(r, c, rr, cc, p, out);
          break;
        }
        if (stopAtCapture) break;
        rr += dr; cc += dc;
      }
    }
  }

  function genPawn(r, c, p, out) {
    const forward = p.s === "r" ? -1 : 1;
    const rr = r + forward;
    if (inBounds(rr, c)) addMove(r, c, rr, c, p, out);
    if (riverCrossed(p.s, r)) {
      if (inBounds(r, c - 1)) addMove(r, c, r, c - 1, p, out);
      if (inBounds(r, c + 1)) addMove(r, c, r, c + 1, p, out);
    }
  }

  // ===== Apply / Undo =====

  function doMove(m) {
    const p = board[m.fr][m.fc];
    board[m.tr][m.tc] = p ? clonePiece(p) : null;
    board[m.fr][m.fc] = null;
    history.push(m);
    turn = other(turn);
  }

  function undoMove() {
    const m = history.pop();
    if (!m) return;
    turn = other(turn);
    board[m.fr][m.fc] = clonePiece(m.moved);
    board[m.tr][m.tc] = m.capture ? clonePiece(m.capture) : null;
  }

  function applyMove(m) {
    if (aiThinking) return;
    const state = gameState();
    if (state.kind === "checkmate" || state.kind === "stalemate") return;
    doMove(m);
    selected = null;
    legalTargets = [];
    syncUI();
    draw();
    maybeAiMove();
  }

  // ===== Interaction =====

  canvas.addEventListener("click", (e) => {
    if (aiThinking) return;
    if (!isHumanTurn()) return;
    const { r, c } = canvasToCell(e.clientX, e.clientY);
    if (!inBounds(r, c)) return;

    const p = board[r][c];
    if (selected) {
      // If clicked a legal target => move
      const mv = legalTargets.find((t) => t.r === r && t.c === c)
        ? findMove(selected.r, selected.c, r, c)
        : null;
      if (mv) return applyMove(mv);

      // Select another own piece
      if (p && p.s === turn) return selectCell(r, c);

      // Otherwise clear selection
      selected = null;
      legalTargets = [];
      syncUI();
      draw();
      return;
    }

    if (p && p.s === turn) selectCell(r, c);
  });

  window.addEventListener("resize", () => {
    resizeCanvas();
    draw();
  });

  btnNew.addEventListener("click", () => init());

  btnUndo.addEventListener("click", () => {
    if (aiThinking) return;
    if (history.length === 0) return;
    const state = gameState();
    if (state.kind === "checkmate" || state.kind === "stalemate") {
      // allow undo after end
    }
    if (settings.mode === "ai") {
      undoMove();
      if (history.length > 0 && turn !== settings.human) undoMove();
    } else {
      undoMove();
    }
    selected = null;
    legalTargets = [];
    syncUI();
    draw();
  });

  modeSelect.addEventListener("change", () => init());
  humanSideSelect.addEventListener("change", () => init());
  aiLevelSelect.addEventListener("change", () => init());

  function selectCell(r, c) {
    selected = { r, c };
    const p = board[r][c];
    if (!p) {
      legalTargets = [];
      return;
    }
    const legal = generateLegalMoves(turn).filter((m) => m.fr === r && m.fc === c);
    legalTargets = legal.map((m) => ({ r: m.tr, c: m.tc }));
    syncUI();
    draw();
  }

  function findMove(fr, fc, tr, tc) {
    const legal = generateLegalMoves(turn);
    return legal.find((m) => m.fr === fr && m.fc === fc && m.tr === tr && m.tc === tc) || null;
  }

  // ===== AI =====

  function maybeAiMove() {
    if (settings.mode !== "ai") return;
    if (turn === settings.human) return;
    const state = gameState();
    if (state.kind === "checkmate" || state.kind === "stalemate") return;
    if (aiThinking) return;

    aiThinking = true;
    syncUI();
    window.setTimeout(() => {
      const aiSide = other(settings.human);
      const move = pickAiMove(aiSide);
      aiThinking = false;
      if (move) applyMove(move);
      else {
        syncUI();
        draw();
      }
    }, 60);
  }

  function pickAiMove(side) {
    const moves = generateLegalMoves(side);
    if (moves.length === 0) return null;

    const cfg = aiConfig(settings.aiLevel);
    if (cfg.randomOnly) {
      const caps = moves.filter((m) => m.capture);
      const pool = caps.length ? caps : moves;
      return pool[Math.floor(Math.random() * pool.length)];
    }

    let best = null;
    let bestScore = -Infinity;
    const ordered = orderMoves(moves);
    const limited = cfg.maxCandidates ? ordered.slice(0, cfg.maxCandidates) : ordered;
    for (const m of limited) {
      doMove(m);
      const score = -search(other(side), cfg.depth - 1, -Infinity, Infinity, cfg);
      undoMove();
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    if (!best) return limited[0] || ordered[0] || null;
    if (cfg.jitter > 0) {
      // Softmax-ish pick among top few to feel less robotic on lower levels.
      const top = [];
      for (const m of limited.slice(0, Math.min(8, limited.length))) {
        doMove(m);
        const s = -search(other(side), cfg.depth - 1, -Infinity, Infinity, cfg);
        undoMove();
        top.push({ m, s });
      }
      top.sort((a, b) => b.s - a.s);
      const k = Math.min(top.length, cfg.topK);
      const pick = weightedPick(top.slice(0, k), cfg.jitter);
      return pick || best;
    }
    return best;
  }

  function orderMoves(moves) {
    return [...moves].sort((a, b) => {
      const sa = (a.capture ? pieceValue(a.capture) : 0) + (a.moved.t === "p" ? 0.2 : 0);
      const sb = (b.capture ? pieceValue(b.capture) : 0) + (b.moved.t === "p" ? 0.2 : 0);
      return sb - sa;
    });
  }

  function search(side, depth, alpha, beta, cfg) {
    const state = gameState();
    if (state.kind === "checkmate") {
      // side to move is checkmated => very bad
      return -100000 + depth;
    }
    if (state.kind === "stalemate") return 0;
    if (depth <= 0) return evaluate(side, cfg);

    const moves = generateLegalMoves(side);
    if (moves.length === 0) return evaluate(side, cfg);
    let best = -Infinity;
    const ordered = orderMoves(moves);
    const limited = cfg.maxCandidates ? ordered.slice(0, cfg.maxCandidates) : ordered;
    for (const m of limited) {
      doMove(m);
      const score = -search(other(side), depth - 1, -beta, -alpha, cfg);
      undoMove();
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  }

  function evaluate(povSide, cfg) {
    // Material + tiny positional/king safety heuristic.
    let score = 0;
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (!p) continue;
      const sgn = p.s === povSide ? 1 : -1;
      score += sgn * pieceValue(p);
      // Pawn advancement bonus
      if (p.t === "p") {
        const adv = p.s === "r" ? (9 - r) : r;
        score += sgn * adv * cfg.pawnAdvance;
      }
      // Center control slight
      const center = 4 - Math.abs(4 - c);
      score += sgn * center * cfg.center;
    }
    // Being in check is bad for side to move (if povSide is side to move)
    if (isInCheck(povSide)) score -= cfg.inCheckPenalty;
    if (isInCheck(other(povSide))) score += cfg.giveCheckBonus;
    return score;
  }

  function aiConfig(level) {
    // depth is in plies for current side (after making candidate move we pass depth-1)
    switch (level) {
      case "beginner":
        return {
          randomOnly: true,
          depth: 1,
          maxCandidates: 0,
          jitter: 1.0,
          topK: 6,
          pawnAdvance: 0.03,
          center: 0.01,
          inCheckPenalty: 0.35,
          giveCheckBonus: 0.15,
        };
      case "easy":
        return {
          randomOnly: false,
          depth: 1,
          maxCandidates: 14,
          jitter: 0.8,
          topK: 5,
          pawnAdvance: 0.05,
          center: 0.015,
          inCheckPenalty: 0.45,
          giveCheckBonus: 0.18,
        };
      case "normal":
        return {
          randomOnly: false,
          depth: 2,
          maxCandidates: 18,
          jitter: 0.25,
          topK: 4,
          pawnAdvance: 0.08,
          center: 0.02,
          inCheckPenalty: 0.6,
          giveCheckBonus: 0.4,
        };
      case "hard":
        return {
          randomOnly: false,
          depth: 3,
          maxCandidates: 22,
          jitter: 0.05,
          topK: 3,
          pawnAdvance: 0.09,
          center: 0.025,
          inCheckPenalty: 0.75,
          giveCheckBonus: 0.55,
        };
      case "master":
        return {
          randomOnly: false,
          depth: 4,
          maxCandidates: 26,
          jitter: 0,
          topK: 1,
          pawnAdvance: 0.1,
          center: 0.03,
          inCheckPenalty: 0.9,
          giveCheckBonus: 0.7,
        };
    }
  }

  function weightedPick(items, temperature) {
    if (!items.length) return null;
    if (temperature <= 0) return items[0].m;
    const scores = items.map((x) => x.s);
    const max = Math.max(...scores);
    const w = scores.map((s) => Math.exp((s - max) / Math.max(1e-6, temperature)));
    const sum = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    for (let i = 0; i < items.length; i++) {
      r -= w[i];
      if (r <= 0) return items[i].m;
    }
    return items[0].m;
  }

  function pieceValue(p) {
    if (!p) return 0;
    switch (p.t) {
      case "k": return 10000;
      case "r": return 520;
      case "c": return 350;
      case "n": return 320;
      case "b": return 220;
      case "a": return 200;
      case "p": return 100;
    }
  }

  // Start
  syncControls();
  init();
})();

