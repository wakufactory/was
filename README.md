# was2.js マニュアル

本ドキュメントは、WebAudio API を利用したシンセサイザライブラリ **was2.js** の機能と、その中で利用可能な **MML (Music Macro Language)** 文法についてまとめた統合マニュアルです。  
was2.js は音のシーケンス生成、音源の制御、エフェクト処理などを柔軟に行うためのライブラリで、MML を用いることで音楽シーケンスを簡潔に記述できます。

---

## 1. was2.js の概要と主要コンポーネント

### 1.1 Synth クラス

**役割:**  
AudioContext の生成と、各種 WebAudio ノード（Gain、BiquadFilter、コンプレッサー、アナライザーなど）の設定・接続を行い、シンセサイザの基盤を構築します。

**主なオプション:**
- `context`: 既存の AudioContext を利用する場合に指定
- `tone`: `true` なら低域・高域フィルターを設定
- `comp`: `true` ならダイナミクスコンプレッサーを追加
- `analyse`: `true` ならアナライザーを設定し、波形表示などに利用
- `destination`: 出力先ノード（省略時は AudioContext のデフォルト出力）

**主要メソッド:**
- `now()`: 現在の AudioContext の時刻を返す
- `createOngen(opt)`: 音源生成用の Ongen インスタンスを生成
- `createTrack(opt)`: 個別のトラックとして、パンなどのエフェクト処理を行うためのトラックを生成
- `showwave(can, intv)`: 指定した Canvas に波形・周波数スペクトルを描画

**サンプルコード:**

```javascript
// Synth を初期化（オプション指定）
const synth = new WAS.synth({
  tone: true,
  comp: true,
  analyse: true
});

// 現在の時刻を取得
console.log("Current time:", synth.now());

// Canvas に波形描画
const canvas = document.getElementById('c_wave');
synth.showwave(canvas, 50);
```

---

### 1.2 SeqQueue クラス

**役割:**  
音の再生予約やループ処理を管理するためのキューです。  
指定した時刻にイベントを発火させるため、内部で AudioContext の `currentTime` と予約時刻を比較します。

**主要メソッド:**
- `setqueue(id, ongn, note)`: 指定のノートを予約に追加
- `setloop(id, time, callback)`: ループ再生のためのコールバックを登録
- `clearqueue(id)`: 特定の ID の予約をクリア
- `allclear()`: 全ての予約をクリア

---

### 1.3 Track クラス

**役割:**  
音源の出力に対して、パン（ステレオ・空間）などのエフェクト処理を適用します。  
Synth のノード接続を一部変更して、各トラックごとに独立した音響処理を実現します。

**主要メソッド:**
- `init(param)`: `stereo_pan` や `space_pan` を指定して、エフェクトの設定を行います。

---

### 1.4 Ongen クラス

**役割:**  
実際の音源生成を行うクラスです。  
オシレータ、フィルタ、エンベロープ、LFO などを組み合わせ、音色のパラメータを柔軟に調整できます。

**主要メソッド:**
- `init(param, track)`: 指定のパラメータで各種ノード（oscillator, filter, gain など）を生成・接続。track 指定でトラックに接続可能
- `setopt(param)`: パラメータ（波形、カットオフ、エンベロープ、LFO など）の設定を変更
- `start(t)`: 指定した時刻 `t` に音源を開始
- `stop(t)`: 指定した時刻 `t` に音源を停止
- `note(f, len, time)`: ノート発音。`f` は周波数またはノート名（例: `"A4"`）、`len` は音長、`time` は開始遅延時間  
  内部でエンベロープを設定し、終了時刻を返す
- `noteoff(time)`: エンベロープのリリース処理を実行して音を終了
- `getnote()`: 現在の周波数とボリュームを取得

**サンプルコード:**

```javascript
// オプションを指定して音源生成
const ongen = synth.createOngen({
  osc1: { waveform: "sawtooth", detune: 0 },
  filt1: { cutoff: 20000, resonance: 0 },
  eg: { attack: 0.1, decay: 0.1, sustain: 0.5, release: 1.0, maxvalue: 0.8, minvalue: 0 }
});

// ノート "A4" を発音（音長 0.5 秒、即時開始）
const endTime = ongen.note("A4", 0.5, 0);
console.log("Note will end at:", endTime);
```

---

### 1.5 Clip クラス

**役割:**  
Ongen とシーケンス情報（MML 文字列や note オブジェクト）を組み合わせ、  
ループ再生や連続再生を管理するためのクラスです。

**主要メソッド:**
- `setongn(opt)`: 音源パラメータの設定（モノフォニック／ポリフォニック切替）
- `setseq(seq)`: シーケンス情報の設定。`seq.mml` があれば MML を note オブジェクト配列に変換
- `setnote(st)`: シーケンスの各ノートの再生タイミングを予約
- `playclip(st)`: 予約された時刻からシーケンス再生を開始
- `start(st)`: クリップの再生を開始
- `stop()`: 再生予約をキャンセルして停止
- `getnote()`: 再生中のノート情報を取得

---

### 1.6 MML クラス

**役割:**  
MML (Music Macro Language) の文字列を解析し、各ノートの情報（note, len, gate など）に変換します。

**主要メソッド:**
- `static mml2note(mml, opt)`:  
  MML 文字列（または文字列の配列）を解析し、ノートオブジェクトの配列に変換  
  初期値は以下の通り:
  - オクターブ: `4`
  - ノート長: `L4`
  - ゲート比: `0.8`

**サンプルコード:**

```javascript
// MML 文字列を解析してノートオブジェクトに変換
const mmlString = "l8o4h0.8 CEG<CEG<C>GEC>GE";
const notes = WAS.mml.MML.mml2note(mmlString);
console.log("Parsed notes:", notes);
```

---

## 2. MML 文法の詳細

was2.js で利用可能な MML 文法は、シンプルながら柔軟に音楽シーケンスを記述できます。以下に主要な構文要素をまとめます。

### 2.1 オクターブ指定
- **`O[n]`**  
  現在のオクターブを n（1～8）に設定  
  例: `O4`
- **`<`**  
  オクターブ上昇（+1）
- **`>`**  
  オクターブ下降（-1）

### 2.2 ノート長設定
- **`L[n]`**  
  デフォルトのノート長を設定  
  例: `L8` は 1/8音符を意味する
- 各ノートに数値を付けることで、ノート固有の長さを指定可能  
  例: `C4`

### 2.3 ゲート比設定
- **`H[number]`**  
  ノートのゲート比（発音時間の割合）を指定  
  例: `H0.8`

### 2.4 音符と休符
- **音符指定:**  
  `[CDEFGAB]` から始まり、以下の修飾子を付けられる  
  - `#` または `+`：シャープ  
  - `-` または `!`：フラット  
  数値やドット (`.`) による長さ指定が可能  
  例: `C`, `D#`, `F8.`

- **休符:**  
  **`R[n]`**  
  休符を表現します。数値やドットを付けることで、休符の長さを指定  
  例: `R4.`

### 2.5 グループ（コード）指定

- **中括弧 `{ ... }`**  
  複数の音符やオクターブ指示をまとめ、グループ（コード）として扱います。
- **グループ全体の長さ指定:**  
  中括弧の後に数値を付けることで、グループ全体のノート長を指定  
  例: `{C E G}4`

### 2.6 その他のポイント

- **初期値:**  
  - オクターブ: 初期値は `4`  
  - ノート長: 初期値は `L4`（または設定されたデフォルト値）  
  - ゲート比: 初期値は `0.8`

- **複数の MML 文:**  
  複数の MML 文字列を配列で渡すと、連結して順次再生されます。

---

