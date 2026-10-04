import { readModule, eligibleExits, compose, exportResult, cancelOperations } from './runtime.mjs';

const messages = {
  ja: {
    skip:'ワークスペースへ移動',local:'ローカル処理のみ',heroTitle:'シナリオを、\nつないで育てる。',heroDescription:'別々につくった H5P 教材を、ひとつの分岐シナリオに。ルートと画像を保ち、つないだ後も編集できる形で。',inputGuideLink:'入力の準備について',inputGuideTitle:'お持ちの教材から、始めましょう',inputGuideDescription:'Lumi 10.0.4 / Core 1.27 / Branching Scenario 1.8.14 の同一プロファイルから書き出した H5P を 2〜5 個用意してください。開始画面を残す教材を最初に選び、追加素材の開始画面は空にします。',noBundledExamples:'サンプル H5P は同梱していません。1 ファイル 32 MiB 以下・合計 64 MiB 以下。選択した教材はブラウザの外へ送信されません。',chooseFiles:'H5P ファイルを選ぶ',heroNote:'アカウント不要。教材ファイルは、このブラウザの中だけで処理します。',illustrationCaption:'素材のまま、ひとつの教材へ',scopeLink:'対応範囲を確認 ↘',inputKicker:'INPUT MODULES',inputTitle:'素材を並べる',inputDescription:'同じ対応プロファイルの教材を 2〜5 個。最初の教材がホストになります。',reset:'最初から',dropTitle:'H5P ファイルをここにドロップ',dropHint:'2〜5 個をまとめて選択 · 読み込み直すと現在の素材を置き換えます',browseFiles:'ファイルを選ぶ',connectionKicker:'CONNECT EXITS',connectionTitle:'終点の、その先をつなぐ',connectionDescription:'フィードバックのない終点から、別の素材の先頭（ノード 0）へ。内部の分岐はそのまま残ります。',connectionEmptyTitle:'まずは素材を読み込みましょう',connectionEmptyDescription:'対応する H5P を 2〜5 個選ぶと、各素材の終点と接続先を設定できます。',overviewKicker:'COMPOSITION PLAN',overviewTitle:'つながりの見取り図',sharedNote:'同じ素材への接続が増えても、ノードと画像は一度だけ取り込みます。',validateHint:'最大 60 ノード・512 ルート。循環や未接続の素材は書き出せません。',validate:'接続を検証する',exportKicker:'VERIFY & EXPORT',resultTitle:'確かめて、持ち出す',resultDescription:'全ルート・ノード対応・画像の由来を確認。H5P と検証記録をまとめて手元へ。',notValidated:'未検証',needsValidation:'変更あり · 再検証',validated:'✓ 静的検証済み',resultEmpty:'接続の検証が完了すると、ここに構成とダウンロードが表示されます。',exportReady:'編集できる H5P と、確認できる記録。',exportReadyNote:'元ファイルは変更しません。取り込み先では、対応範囲を確認してご利用ください。',downloadH5p:'H5P をダウンロード',downloadManifest:'JSON マニフェスト ↓',downloadReport:'テキストレポート ↓',tabRoutes:'全ルート',tabNodes:'ノード対応',tabAssets:'画像と由来',tabRecord:'検証記録',scopeTitle:'小さく定めて、\n確かにつなぐ。',scopeDescription:'BranchSplice は、対応範囲を絞った教材構成ツールです。検証対象外の設定は、黙って変換せずに止めます。',supportedTitle:'このプロファイルでできること',supportedDescription:'Branching Question・Advanced Text・Image。2〜5 素材、合計 60 ノード以下、全 512 ルート以下。ホストの開始画面を保持し、追加素材の開始画面は空である必要があります。',unsupportedTitle:'対応範囲の外',unsupportedDescription:'得点、後戻り、ランダム化、他のコンテンツ形式。教材間で異なる全体設定・終了画面・ライブラリは受け付けません。Lumi Desktop や Core 1.28、すべての H5P 環境での互換性を保証するものではありません。',privacyTitle:'教材を外へ送らない',privacyDescription:'処理とプレビューはブラウザ内。アップロード、分析通信、学習者データ、学習記録の保存はありません。画面を閉じると作業内容は失われます。',footerLine:'つなぐ構造を、見える形に。',moduleNodes:'ノード',moduleRoutes:'ルート',moduleImages:'画像',host:'ホスト',donor:'追加素材',setHost:'ホストにする',setHostHint:'{name} をホストにして接続をクリア',removeModule:'{name} を取り除く',inspectNodes:'素材のノードを見る（{count}）',sourceNote:'原文のテキスト表示です。H5P プレーヤーの再現ではありません。',retainedStart:'開始画面を保持',emptyStart:'開始画面は空です',selectDestination:'{source} の接続先',keepEnding:'終点のまま',entry:'先頭 0',choice:'選択肢 {number}',blockedFeedback:'接続不可：この終点には固有のフィードバックがあります。原文・画像・得点の消失を避けるため保持します。',blockedExit:'接続不可：{reason}',noExits:'接続できる終点がありません。',mapEmpty:'終点から接続先を選択してください。',sharedUses:'{count} 接続で共有',unconnected:'まだ接続がない素材：{names}',connectionCount:'{count} CONNECTIONS',nodeMetric:'出力ノード',routeMetric:'完全なルート',assetMetric:'出力画像ファイル',renameMetric:'衝突で改名した画像',routeIntro:'先頭から終点までの全 {count} ルート。A0 などは「素材の記号＋元ノード番号」です。開くと選択肢と原文を確認できます。',noChoices:'選択肢のないルート',routeEnding:'終点',customEnding:'固有フィードバックで終了',defaultEnding:'共通の終了画面',routePage:'{start}–{end} / {total} ルート',previous:'前へ',next:'次へ',nodesIntro:'ホストの subContentId は保持。追加素材の ID は、素材ごとに一度だけ再生成します。元と出力の対応をすべて記録します。',sourceNode:'元ノード',outputNode:'出力ノード',nodeContent:'原文 / 種類',idStatus:'ID の扱い',idRetained:'保持',idRegenerated:'再生成',assetIntro:'同じ名前で内容が異なる画像は、衝突を避けて改名します。画像バイトと SHA-256 は保持し、型付き画像参照だけを更新します。',assetNone:'この構成には画像ファイルがありません。',assetRenamed:'改名あり',assetShared:'同じバイトを共有',assetUnchanged:'パス保持',sourcePath:'元',outputPath:'出力',imageFallback:'画像プレビューなし',recordIntro:'この出力の検証結果と由来。各項目の詳細は JSON マニフェストにも含まれます。',recordStaticTitle:'この出力の検証',recordStatic:'グラフ、到達可能性、全ルート、画像のハッシュ、ライブラリと設定の整合性を静的に検証しました。',recordNativeTitle:'ネイティブ環境での確認範囲',recordNative:'このダウンロード自体をネイティブの H5P プレーヤーで再テストしたものではありません。対象プロファイルの合成サンプルについて、リポジトリに別途検証記録があります。',recordHost:'保持したホスト',recordHash:'出力の SHA-256',recordInputs:'入力の SHA-256',recordFull:'完全なマニフェスト',loadingFiles:'{count} 個の H5P を読み込み中です。数秒かかることがあります…',loadingFile:'{name} を検証中（{index}/{count}）…',loadSuccess:'{count} 個の素材を読み込みました。終点の接続先を選び、検証してください。',validating:'接続・全ルート・画像を検証し、書き出しを準備しています…',validationSuccess:'{modules} 素材・{nodes} ノード・{routes} ルートの静的検証が完了しました。出力と検証記録をダウンロードできます。',changed:'接続が変わりました。再検証するまで、前の出力は利用できません。',hostChanged:'ホストを変更し、接続をクリアしました。開始画面の条件を確認し、再接続してください。',removed:'素材を取り除きました。構成を再検証してください。',resetDone:'素材と接続をクリアしました。',fileCountError:'同時に 2〜5 個の H5P ファイルを選択してください。',fileTypeError:'.h5p ファイルを選択してください：{name}',tooLarge:'H5P は 1 個あたり 32 MiB 以下、合計 64 MiB 以下で選択してください。',failed:'処理を完了できませんでした。',technicalDetail:'技術的な詳細',errorContext:'対象',downloadStarted:'{name} のダウンロードを開始しました。',errorRecovery:'入力や接続を見直して、もう一度お試しください。',downloadUnavailable:'構成が変わったため、もう一度検証してください。',workingValidate:'検証中…',fileLabel:'H5P ファイル（2〜5 個）',inspectionLabel:'出力の確認',bytes:'バイト',assetReferences:'画像参照の対応',referenceCount:'参照 {count} 件',startSubtitle:'開始画面の副題',startTitle:'開始画面の題名',moduleCountLabel:'{count} MODULES',removedAll:'素材を取り除きました。新しい H5P ファイルを読み込んでください。'
  },
  en: {
    skip:'Skip to workspace',local:'Local processing only',heroTitle:'A new path for\nevery scenario.',heroDescription:'Bring independently authored H5P modules into one branching scenario. Keep the routes, preserve the images, and keep editing after you connect.',inputGuideLink:'Prepare your inputs',inputGuideTitle:'Start with your own modules',inputGuideDescription:'Prepare 2–5 H5P files exported from the same Lumi 10.0.4 / Core 1.27 / Branching Scenario 1.8.14 profile. Choose the module whose start screen you want to retain first; donor start screens must be empty.',noBundledExamples:'No example H5Ps are bundled. Up to 32 MiB per file and 64 MiB combined. Your selected content never leaves this browser.',chooseFiles:'Choose H5P files',heroNote:'No account needed. Your content stays in this browser.',illustrationCaption:'Separate modules. One editable story.',scopeLink:'Explore the supported scope ↘',inputKicker:'INPUT MODULES',inputTitle:'Gather your modules',inputDescription:'Choose 2–5 modules from the same supported profile. The first module becomes the host.',reset:'Start over',dropTitle:'Drop your H5P files here',dropHint:'Choose 2–5 together · A new selection replaces the current modules',browseFiles:'Browse files',connectionKicker:'CONNECT EXITS',connectionTitle:'Give each ending a next step',connectionDescription:'Connect an ending with empty feedback to another module’s entry (node 0). Internal branches stay intact.',connectionEmptyTitle:'Start with a few modules',connectionEmptyDescription:'Choose 2–5 supported H5P files to see their terminal exits and connect them.',overviewKicker:'COMPOSITION PLAN',overviewTitle:'See how it connects',sharedNote:'Multiple connections to the same module still import its nodes and images only once.',validateHint:'Up to 60 nodes and 512 routes. Cycles and unreachable modules block export.',validate:'Validate connections',exportKicker:'VERIFY & EXPORT',resultTitle:'Inspect it. Take it with you.',resultDescription:'Review every route, node mapping, and image origin. Download the H5P with its validation records.',notValidated:'Not validated',needsValidation:'Changed · validate again',validated:'✓ Statically validated',resultEmpty:'Your composition and downloads will appear here after validation succeeds.',exportReady:'Editable content. A traceable composition.',exportReadyNote:'Your source files stay unchanged. Check the supported profile before importing the output.',downloadH5p:'Download editable H5P',downloadManifest:'JSON manifest ↓',downloadReport:'Text report ↓',tabRoutes:'All routes',tabNodes:'Node mappings',tabAssets:'Images & origins',tabRecord:'Validation record',scopeTitle:'A smaller scope.\nA clearer connection.',scopeDescription:'BranchSplice is a deliberately bounded composition tool. Unsupported settings stop the process instead of being silently converted.',supportedTitle:'Within this profile',supportedDescription:'Branching Question, Advanced Text, and Image. 2–5 modules, up to 60 total nodes and 512 complete routes. The host’s start screen is retained; donor start screens must be empty.',unsupportedTitle:'Outside the boundary',unsupportedDescription:'Scoring, backwards navigation, randomization, and other content types. Conflicting global settings, default endings, or libraries are rejected. This does not guarantee compatibility with Lumi Desktop, Core 1.28, or every H5P environment.',privacyTitle:'Your content stays here',privacyDescription:'Processing and previews stay in this browser. No uploads, analytics, learner data, or learning records. Closing the page discards this workspace.',footerLine:'Make every connection visible.',moduleNodes:'nodes',moduleRoutes:'routes',moduleImages:'images',host:'HOST',donor:'DONOR',setHost:'Make host',setHostHint:'Make {name} the host and clear connections',removeModule:'Remove {name}',inspectNodes:'Inspect source nodes ({count})',sourceNote:'Plain-text source preview, not a reproduction of the H5P player.',retainedStart:'HOST OPENING RETAINED',emptyStart:'The start screen is empty',selectDestination:'Destination for {source}',keepEnding:'Keep as an ending',entry:'entry 0',choice:'choice {number}',blockedFeedback:'Blocked: this exit has custom feedback. It is preserved to prevent losing its text, images, or score.',blockedExit:'Blocked: {reason}',noExits:'This module has no terminal exits.',mapEmpty:'Choose a destination for an ending.',sharedUses:'shared by {count} exits',unconnected:'No incoming connection yet: {names}',connectionCount:'{count} CONNECTIONS',nodeMetric:'Output nodes',routeMetric:'Complete routes',assetMetric:'Output image files',renameMetric:'Collision-renamed images',routeIntro:'All {count} routes from entry to ending. Labels such as A0 mean “module letter + original node index.” Expand a route for choices and source text.',noChoices:'No branching choices',routeEnding:'END',customEnding:'Ends with custom feedback',defaultEnding:'Shared default ending',routePage:'{start}–{end} of {total} routes',previous:'Previous',next:'Next',nodesIntro:'Host subContentIds are retained. Donor IDs are regenerated once per donor node. Every source-to-output mapping is recorded.',sourceNode:'Source node',outputNode:'Output node',nodeContent:'Source / type',idStatus:'Identifier',idRetained:'Retained',idRegenerated:'Regenerated',assetIntro:'Different images with the same filename are renamed safely. Image bytes and SHA-256 are preserved; only typed image references are updated.',assetNone:'This composition contains no image files.',assetRenamed:'Renamed',assetShared:'Identical bytes shared',assetUnchanged:'Path retained',sourcePath:'Source',outputPath:'Output',imageFallback:'No image preview',recordIntro:'Validation and provenance for this output. The JSON manifest includes the full details.',recordStaticTitle:'Checks for this output',recordStatic:'Static checks passed for the graph, reachability, complete routes, image hashes, and library and settings consistency.',recordNativeTitle:'Native-consumer coverage',recordNative:'This individual download has not been replayed in a native H5P player. Consult the repository verification status for synthetic samples in the pinned profile.',recordHost:'Retained host',recordHash:'Output SHA-256',recordInputs:'Input SHA-256',recordFull:'Complete manifest',loadingFiles:'Reading {count} H5P modules. This may take a few seconds…',loadingFile:'Validating {name} ({index}/{count})…',loadSuccess:'Loaded {count} modules. Choose the ending connections, then validate.',validating:'Checking connections, complete routes, and images; preparing exports…',validationSuccess:'Static validation passed: {modules} modules, {nodes} nodes, {routes} routes. The output and records are ready to download.',changed:'Connections changed. Previous exports are unavailable until you validate again.',hostChanged:'Host changed and connections cleared. Check the start-screen requirements, then reconnect the modules.',removed:'Module removed. Validate the composition again.',resetDone:'Modules and connections cleared.',fileCountError:'Choose 2–5 H5P files at the same time.',fileTypeError:'Choose an .h5p file: {name}',tooLarge:'Choose H5P files up to 32 MiB each and 64 MiB combined.',failed:'The operation could not be completed.',technicalDetail:'Technical detail',errorContext:'Context',downloadStarted:'Started downloading {name}.',errorRecovery:'Review your inputs or connections, then try again.',downloadUnavailable:'The composition changed. Please validate again.',workingValidate:'Validating…',fileLabel:'H5P files (2–5)',inspectionLabel:'Output inspection',bytes:'bytes',assetReferences:'Typed image reference mappings',referenceCount:'{count} references',startSubtitle:'Start-screen subtitle',startTitle:'Start-screen title',moduleCountLabel:'{count} MODULES',removedAll:'Module removed. Choose new H5P files to continue.'
  }
};

const errorHelp = {
  RECEIPT_LIMIT:['長い選択肢やフィードバックの繰り返しで、検証記録が 8 MiB の上限を超えます。文章や分岐を減らしてください。','Repeated labels or feedback exceed the 8 MiB receipt budget. Reduce text or branches.'],
  CONTENT_LIMIT:['結合後の教材 JSON が 2 MiB の上限を超えます。素材や文章を減らしてください。','Combined content JSON exceeds 2 MiB. Use fewer modules or less text.'],
  CYCLE:['接続によって循環ができます。後の素材から前の素材へ戻る接続を外してください。','These connections create a cycle. Remove connections that lead back to an earlier module.'],
  UNREACHABLE:['ホストの先頭から到達できない素材またはノードがあります。すべての素材に接続を設定してください。','Some modules or nodes are unreachable from the host. Connect every donor into the composition.'],
  DONOR_START:['追加素材の開始画面は空である必要があります。開始画面を残す素材をホストにしてください。','Donor start screens must be empty. Make the module whose opening you want to retain the host.'],
  CUSTOM_FEEDBACK:['固有のフィードバックがある終点は置き換えられません。別の終点を選んでください。','An ending with custom feedback cannot be replaced. Choose a different exit.'],
  GLOBAL_SETTINGS:['全体設定・共通の終了画面・表示文言が素材間で異なります。同じ設定で書き出した素材を使ってください。','Global settings, default endings, or localization differ. Use modules exported with identical shared settings.'],
  GLOBAL_IMAGE:['共通の終了画面の画像が素材間で異なります。同じ画像を使った素材を選択してください。','Shared ending images differ between modules. Use modules with identical shared ending images.'],
  PACKAGE_METADATA:['タイトルと依存関係以外のパッケージ情報が一致しません。権利情報などを自動で上書きすることはできません。','Package metadata differs beyond titles and dependencies. Rights and other metadata are never silently overwritten.'],
  LIBRARY_CONFLICT:['同じライブラリのファイルが一致しません。すべての素材を同じ対応プロファイルから書き出してください。','Library file bytes conflict. Re-export every module from the same supported profile.'],
  NODE_LIMIT:['合計ノード数が上限の 60 を超えています。素材を減らしてください。','The composition exceeds 60 nodes. Use fewer or smaller modules.'],
  ROUTE_LIMIT:['完全なルート数が上限の 512 を超えています。接続または分岐を減らしてください。','The composition exceeds 512 complete routes. Reduce connections or branches.'],
  MODULE_COUNT:['同じ対応プロファイルの素材を 2〜5 個用意してください。','Choose 2–5 modules from the supported profile.'],
  INPUT_LIMIT:['圧縮済み入力の合計は 64 MiB 以下にしてください。','Keep the combined compressed input within 64 MiB.'],
  NODE_LIBRARY:['対応するノードは Branching Question・Advanced Text・Image のみです。','Only Branching Question, Advanced Text, and Image nodes are supported.'],
  SCORING_UNSUPPORTED:['得点設定がある素材には対応していません。得点を使わない教材を選んでください。','Scoring is outside this profile. Choose modules with no scoring.'],
  BEHAVIOUR_UNSUPPORTED:['後戻りやランダム化など、対応していない動作設定があります。','Backwards navigation, randomization, or another unsupported behavior is enabled.'],
  GRAPH_CYCLE:['入力素材の中に循環があります。循環のない教材を選んでください。','An input module contains a cycle. Choose an acyclic module.'],
  GRAPH_UNREACHABLE:['入力素材に到達できないノードがあります。素材側で経路を見直してください。','An input module has unreachable nodes. Review its internal routes.'],
  GRAPH_NODE_LIMIT:['入力素材のノード数が対応範囲を超えています。','An input module exceeds the supported node limit.'],
  GRAPH_ROUTE_LIMIT:['入力素材のルート数が対応範囲を超えています。','An input module exceeds the supported route limit.'],
  IMAGE_PATH:['画像の参照先が無効です。素材の画像ファイルと参照を確認してください。','An image reference is invalid. Check the source image files and references.'],
  IMAGE_MIME:['画像の形式が対応範囲外、または画像情報と一致しません。','An image type is unsupported or differs from its declared format.'],
  ZIP_COMPRESSED_LIMIT:['ファイルの大きさが 32 MiB の上限を超えています。','An input archive exceeds the 32 MiB compressed-file limit.'],
  ZIP_EXPANDED_LIMIT:['展開後のサイズが上限を超えるため、この教材は読み込めません。','The archive exceeds the expanded-size limit and cannot be loaded.']
};

const state = { language:'ja', modules:[], letters:new Map(), exits:[], connections:[], phase:'idle', revision:0, sourceEpoch:0, result:null, artifacts:null, exportManifest:null, resultRevision:-1, notice:null, activePanel:'routes', routePage:0, sourceUrls:new Map(), exportUrls:new Map(), dirty:false };
const $ = id => document.getElementById(id);
const t = (key, values={}) => (messages[state.language][key] ?? messages.en[key] ?? key).replace(/\{(\w+)\}/g,(_,k)=>String(values[k]??''));
function node(tag, className='', text){ const n=document.createElement(tag); if(className)n.className=className; if(text!==undefined)n.textContent=String(text); return n; }
function append(parent,...children){ for(const child of children) if(child!==null&&child!==undefined) parent.append(child); return parent; }
function button(label,className,action){ const b=node('button',className,label); b.type='button'; b.addEventListener('click',action); return b; }
function setText(id,value){ $(id).textContent=value; }
function scenario(module){ return module.params.branchingScenario; }
function letter(moduleId){ return state.letters.get(moduleId) ?? String(moduleId); }
function moduleName(module){ return module.h5p?.title || module.filename || module.id; }
function sourceLabel(moduleId,index,alternative=null){ return `${letter(moduleId)}${index}${alternative===null?'':` · ${t('choice',{number:alternative+1})}`}`; }
function exitKey(exit){ return JSON.stringify([exit.moduleId??exit.fromModule,exit.node??exit.fromNode,exit.alternative??null]); }

/** This is a plain-text preview, not an HTML interpreter. No source markup reaches the DOM. */
export function plainSourceText(value){
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',hellip:'…',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”'};
  return String(value??'').replace(/<\s*(?:script|style)\b[^>]*>[\s\S]*?<\s*\/(?:script|style)\s*>/gi,'').replace(/<\s*(?:br\s*\/?|\/(?:p|div|li|h[1-6]))\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(all,key)=>{
    if(key[0]==='#'){ const number=key[1]?.toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10); return Number.isInteger(number)&&number>0&&number<=0x10ffff&&!(number>=0xd800&&number<=0xdfff)?String.fromCodePoint(number):'�'; }
    return named[key.toLowerCase()]??all;
  }).replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n').trim();
}
export function previewText(content){ const type=content?.type; if(!type)return ''; const p=type.params??{}; return plainSourceText(p.branchingQuestion?.question??p.text??p.alt??type.metadata?.title??type.library); }
function libraryName(content){ return content.type.library.replace(/^H5P\./,''); }
function truncate(text,max=120){ const chars=Array.from(text); return chars.length>max?chars.slice(0,max).join('')+'…':text; }
function mapEntries(value){ return value instanceof Map?[...value.entries()]:Object.entries(value??{}); }
function mapGet(value,key){ return value instanceof Map?value.get(key):value?.[key]; }
function revokeAll(map){ for(const url of map.values())URL.revokeObjectURL(url); map.clear(); }
function imageUrl(module,path){
  const asset=mapGet(module.assets,path); if(!asset?.bytes||!/^image\/(?:png|jpeg|gif|webp)$/.test(asset.mime))return null;
  const key=JSON.stringify([module.id,path]); if(!state.sourceUrls.has(key))state.sourceUrls.set(key,URL.createObjectURL(new Blob([asset.bytes],{type:asset.mime})));
  return state.sourceUrls.get(key);
}
function makeImage(module,path,alt=''){
  const src=imageUrl(module,path); if(!src)return null; const image=node('img'); image.src=src; image.alt=String(alt); image.loading='lazy'; image.decoding='async'; return image;
}
function badge(moduleId){ const b=node('span','module-letter',letter(moduleId)); b.dataset.color=String(Math.max(0,letter(moduleId).charCodeAt(0)-65)%5); return b; }
function notify(key,values={},kind='info'){ state.notice={key,values,kind}; renderNotice(); }
function notifyError(error){ state.notice={error,kind:'error'}; renderNotice(); }
function renderNotice(){
  const box=$('status-message'); if(!state.notice){box.hidden=true;box.replaceChildren();return;}
  box.hidden=false;box.className=`notice ${state.notice.kind}`;box.setAttribute('role',state.notice.kind==='error'?'alert':'status');
  if(!state.notice.error){box.textContent=t(state.notice.key,state.notice.values);return;}
  const e=state.notice.error;const code=e.code??'';const help=errorHelp[code]??genericErrorHelp(code);const detail=typeof e.detail==='string'?e.detail:e.detail&&Object.keys(e.detail).length?JSON.stringify(e.detail):'';
  const main=help?help[state.language==='ja'?0:1]:(e.uiKey?t(e.uiKey,e.values):t('failed'));
  box.textContent=[main,t('errorRecovery'),code?`${t('technicalDetail')}: ${code}`:'',e.message&&!e.uiKey?String(e.message):'',detail?`${t('errorContext')}: ${detail}`:''].filter(Boolean).join('\n');
}
function genericErrorHelp(code){
  const prefix=String(code).split('_')[0];
  const families={
    METADATA:['パッケージ情報または権利情報の形式が対応プロファイルと一致しません。元の編集環境で確認してください。','Package or rights metadata is outside the supported schema. Review it in the original editor.'],
    HTML:['本文やメタデータに対応範囲外の HTML または属性があります。内容を確認してください。','Text or metadata contains unsupported HTML or attributes. Review the source content.'],
    ZIP:['安全に展開できない H5P パッケージです。対応プロファイルから書き出し直したファイルを選んでください。','This H5P archive cannot be safely unpacked. Re-export it from the supported profile.'],
    JSON:['教材内の JSON データが不正、または対応範囲外です。元の編集環境から書き出し直してください。','The package contains invalid or unsupported JSON. Re-export it from its original editor.'],
    LIBRARY:['ライブラリが固定プロファイルと一致しません。指定したバージョンとファイルを持つ素材を選んでください。','The libraries do not match the pinned profile. Use modules with the supported versions and exact library files.'],
    PARAMS:['教材の設定または構造が対応範囲外です。対応するノードと動作設定を確認してください。','The content settings or structure are outside the supported profile. Check its node types and behavior settings.'],
    IMAGE:['画像の形式・寸法・参照が対応条件を満たしていません。元の素材の画像を確認してください。','An image format, dimension, or reference is outside the supported limits. Check the original image assets.'],
    ASSET:['画像ファイルと教材内の参照が一致しません。素材の画像を確認してから書き出し直してください。','Image files and typed content references do not match. Check the assets and re-export the module.'],
    PACKAGE:['対応する Branching Scenario パッケージではありません。元の環境から H5P 形式で書き出してください。','This is not a supported Branching Scenario package. Export it as H5P from the original environment.'],
    GRAPH:['入力素材の経路に不整合があります。元の編集環境で分岐と終点を確認してください。','An input route graph is inconsistent. Check its branches and endings in the source editor.']
  };return families[prefix];
}
function uiError(key,values={}){ return {uiKey:key,values}; }
function clearResult(){
  state.result=null;state.artifacts=null;state.exportManifest=null;state.resultRevision=-1;state.routePage=0;revokeAll(state.exportUrls);
  $('results').hidden=true;$('result-empty').hidden=false;$('validation-state').className='validation-state';setText('validation-state',t(state.dirty?'needsValidation':'notValidated'));
  for(const id of ['panel-routes','panel-nodes','panel-assets','panel-record','metrics'])$(id).replaceChildren();
  for(const id of ['download-h5p','download-manifest','download-report'])$(id).disabled=true;
}
function invalidate(){ state.revision++;state.dirty=state.modules.length>0;state.phase='idle';clearResult();renderControls(); }
function sourceChange(){
  state.sourceEpoch++;state.revision++;cancelOperations();state.phase='idle';state.modules=[];state.exits=[];state.connections=[];state.letters.clear();state.dirty=false;state.notice=null;revokeAll(state.sourceUrls);clearResult();return state.sourceEpoch;
}
function renderControls(){
  document.body.classList.toggle('busy',state.phase!=='idle');$('workspace').setAttribute('aria-busy',String(state.phase!=='idle'));
  $('validate-button').disabled=state.modules.length<2||state.phase!=='idle';
  $('reset-button').disabled=state.modules.length===0&&state.phase==='idle'&&!state.notice;
  $('validate-button').querySelector('[data-i18n]').textContent=t(state.phase==='validating'?'workingValidate':'validate');
}
function renderLanguage(){
  document.documentElement.lang=state.language;
  for(const element of document.querySelectorAll('[data-i18n]'))element.textContent=t(element.dataset.i18n);
  for(const b of document.querySelectorAll('[data-lang]'))b.setAttribute('aria-pressed',String(b.dataset.lang===state.language));
  $('file-input').setAttribute('aria-label',t('fileLabel'));document.querySelector('.inspection-tabs').setAttribute('aria-label',t('inspectionLabel'));
  renderAll();
}
function renderModules(){
  const grid=$('modules');grid.replaceChildren();
  state.modules.forEach((module,index)=>{
    const contents=scenario(module).content; const card=node('article',`module-card${index===0?' is-host':''}`);card.dataset.moduleId=module.id;
    const header=node('div','module-card-header'); const top=node('div','module-topcopy');append(top,node('h3','module-title',moduleName(module)),node('p','module-filename',module.filename));
    const remove=button('×','remove-button',()=>removeModule(module.id));remove.setAttribute('aria-label',t('removeModule',{name:moduleName(module)}));
    append(header,badge(module.id),top,remove);card.append(header);
    const meta=node('div','module-meta');for(const [count,key]of [[contents.length,'moduleNodes'],[module.routes?.length??0,'moduleRoutes'],[mapEntries(module.assets).length,'moduleImages']]){const item=node('span');append(item,node('b','',count),document.createTextNode(' '+t(key)));meta.append(item);}card.append(meta);
    const first=contents[0];const preview=node('div','module-preview');if(first.type.library.startsWith('H5P.Image '))append(preview,makeImage(module,first.type.params.file.path,first.type.params.alt));const text=node('div');append(text,node('span','preview-node-id',`${letter(module.id)}0 · ${libraryName(first)}`),node('p','',previewText(first)));preview.append(text);card.append(preview);
    const footer=node('div','module-footer');if(index===0)footer.append(node('span','host-tag',t('host')));else{const host=button(t('setHost'),'host-button',()=>makeHost(module.id));host.setAttribute('aria-label',t('setHostHint',{name:moduleName(module)}));host.title=t('setHostHint',{name:moduleName(module)});footer.append(host);}footer.append(node('span','mono',`${(module.sizeBytes/1024/1024).toFixed(1)} MiB`));card.append(footer);
    const details=node('details','source-details');details.append(node('summary','',t('inspectNodes',{count:contents.length})));const list=node('ol','source-list');
    contents.forEach((content,i)=>{const li=node('li');append(li,node('strong','',`${letter(module.id)}${i} · ${libraryName(content)}`),node('p','',previewText(content)));if(content.type.library.startsWith('H5P.Image '))append(li,makeImage(module,content.type.params.file.path,content.type.params.alt));const q=content.type.params.branchingQuestion;if(q)for(const [j,a]of q.alternatives.entries())li.append(node('p','',`${j+1}. ${plainSourceText(a.text)} → ${a.nextContentId===-1?t('routeEnding'):letter(module.id)+a.nextContentId}`));list.append(li);});
    append(details,list,node('p','source-note',t('sourceNote')));card.append(details);grid.append(card);
  });
  const retained=$('host-retained');retained.hidden=state.modules.length===0;retained.replaceChildren();
  if(state.modules.length){const host=state.modules[0];const start=scenario(host).startScreen??{};const title=plainSourceText(start.startScreenTitle);const subtitle=plainSourceText(start.startScreenSubtitle);const copy=node('div','retained-copy');append(copy,node('strong','',title||t('emptyStart')));if(subtitle)copy.append(document.createTextNode(' · '+subtitle));append(retained,node('span','retained-label',t('retainedStart')),copy);if(start.startScreenImage?.path)append(retained,makeImage(host,start.startScreenImage.path,title));}
}
function renderConnections(){
  const has=state.modules.length>0;$('connection-empty').hidden=has;$('connection-workspace').hidden=!has;
  const groups=$('exit-groups');groups.replaceChildren();
  for(const [index,module]of state.modules.entries()){
    const group=node('section','exit-group');const heading=node('h3','exit-group-title');append(heading,badge(module.id),node('span','',moduleName(module)),node('span','',t(index===0?'host':'donor')));group.append(heading);
    const exits=state.exits.filter(e=>e.moduleId===module.id);if(!exits.length)group.append(node('p','no-exits',t('noExits')));
    for(const exit of exits){
      const row=node('div','exit-row');const label=node(exit.blockedReason?'div':'label','exit-label');const id=`exit-${module.id}-${exit.node}-${exit.alternative===null?'node':exit.alternative}`;if(!exit.blockedReason)label.htmlFor=id;
      append(label,node('strong','',sourceLabel(exit.moduleId,exit.node,exit.alternative)),node('span','',plainSourceText(exit.label)||previewText(scenario(module).content[exit.node])));row.append(label);
      if(exit.blockedReason){const reason=node('span','exit-blocked',exit.blockedReason==='CUSTOM_FEEDBACK'?t('blockedFeedback'):t('blockedExit',{reason:exit.blockedReason}));reason.id=id;row.append(reason);}
      else{
        const select=node('select');select.id=id;select.dataset.exit=exitKey(exit);select.setAttribute('aria-label',t('selectDestination',{source:sourceLabel(exit.moduleId,exit.node,exit.alternative)}));const empty=node('option','',t('keepEnding'));empty.value='';select.append(empty);
        for(const target of state.modules.slice(1)){if(target.id===module.id)continue;const option=node('option','',`${letter(target.id)} · ${truncate(moduleName(target),42)} → ${t('entry')}`);option.value=target.id;select.append(option);}
        const current=state.connections.find(c=>exitKey(c)===exitKey(exit));select.value=current?.toModule??'';select.classList.toggle('has-target',!!select.value);
        select.addEventListener('change',()=>{state.connections=state.connections.filter(c=>exitKey(c)!==exitKey(exit));if(select.value)state.connections.push({fromModule:exit.moduleId,fromNode:exit.node,alternative:exit.alternative,toModule:select.value});select.classList.toggle('has-target',!!select.value);invalidate();renderConnectionMap();notify('changed');});row.append(select);
      }
      group.append(row);
    }
    groups.append(group);
  }
  renderConnectionMap();
}
function renderConnectionMap(){
  setText('connection-count',t('connectionCount',{count:state.connections.length}));const map=$('connection-map');map.replaceChildren();if(!state.modules.length)return;
  const host=state.modules[0];const root=node('div','map-root');append(root,badge(host.id),append(node('div'),node('small','',`HOST / ${letter(host.id)}0`),node('strong','',moduleName(host))));map.append(root);
  if(state.connections.length===0)map.append(node('p','aside-note',t('mapEmpty')));
  else{const list=node('ol','map-list');const counts=new Map();for(const c of state.connections)counts.set(c.toModule,(counts.get(c.toModule)??0)+1);for(const c of state.connections){const li=node('li');append(li,node('span','map-source',sourceLabel(c.fromModule,c.fromNode,c.alternative)),node('span','map-arrow','→'),node('span','map-target',`${letter(c.toModule)}0`));if(counts.get(c.toModule)>1)li.append(node('span','shared-tag',t('sharedUses',{count:counts.get(c.toModule)})));list.append(li);}map.append(list);}
  const unconnected=state.modules.slice(1).filter(m=>!state.connections.some(c=>c.toModule===m.id));if(unconnected.length)map.append(node('p','unconnected-tag',t('unconnected',{names:unconnected.map(m=>letter(m.id)).join(', ')})));
}
function outputSource(outputIndex){
  const mapping=state.result?.manifest?.nodeMappings?.find(m=>m.outputNode===outputIndex);
  if(mapping)return {label:sourceLabel(mapping.moduleId,mapping.sourceNode),moduleId:mapping.moduleId,node:mapping.sourceNode};
  for(const module of [...state.modules].reverse()){const start=mapGet(state.result?.moduleOffsets,module.id);if(Number.isInteger(start)&&outputIndex>=start)return {label:sourceLabel(module.id,outputIndex-start),moduleId:module.id,node:outputIndex-start};}
  return {label:String(outputIndex)};
}
function renderResults(){
  if(!state.result||!state.artifacts){clearResult();return;}
  $('results').hidden=false;$('result-empty').hidden=true;$('validation-state').className='validation-state valid';setText('validation-state',t('validated'));
  for(const id of ['download-h5p','download-manifest','download-report'])$(id).disabled=false;
  const metrics=$('metrics');metrics.replaceChildren();const summary=state.result.summary;
  for(const [value,max,label]of [[summary.nodeCount,'/ 60','nodeMetric'],[summary.routeCount,'/ 512','routeMetric'],[summary.assetCount,'','assetMetric'],[summary.renamedAssetCount,'','renameMetric']]){
    const metric=node('div','metric');const val=node('div','metric-value');append(val,node('strong','',value),node('span','',max));append(metric,val,node('span','metric-label',t(label)));metrics.append(metric);
  }
  renderRoutes();renderNodeMappings();renderAssets();renderRecord();selectPanel(state.activePanel,false);
}
function renderRoutes(){
  const panel=$('panel-routes');panel.replaceChildren();const routes=state.result.routes;panel.append(node('p','panel-intro',t('routeIntro',{count:routes.length})));const perPage=25;const lastPage=Math.max(0,Math.ceil(routes.length/perPage)-1);state.routePage=Math.min(lastPage,state.routePage);const start=state.routePage*perPage;
  routes.slice(start,start+perPage).forEach((route,offset)=>{
    const details=node('details','route-item');const summary=node('summary');append(summary,node('span','route-name',`ROUTE ${String(start+offset+1).padStart(2,'0')}`),node('span','route-chain',route.nodes.map(n=>outputSource(n).label).join(' → ')+` → ${t('routeEnding')}`));details.append(summary);
    const detail=node('div','route-detail');const choices=node('ol','route-choices');for(const choice of route.choices){const li=node('li');append(li,node('strong','',`${outputSource(choice.node).label} / ${choice.alternative+1}`),node('span','',plainSourceText(choice.label)));choices.append(li);}if(!route.choices.length)choices.append(node('li','',t('noChoices')));detail.append(choices);
    const steps=node('ol','route-steps');for(const globalIndex of route.nodes){const content=state.result.params.branchingScenario.content[globalIndex];const li=node('li');append(li,node('span','',outputSource(globalIndex).label),node('span','',previewText(content)));steps.append(li);}detail.append(steps);
    if(route.ending)detail.append(node('p','source-note',t(route.ending.customFeedback?'customEnding':'defaultEnding')));details.append(detail);panel.append(details);
  });
  if(routes.length>perPage){const pagination=node('div','pagination');pagination.append(node('span','',t('routePage',{start:start+1,end:Math.min(start+perPage,routes.length),total:routes.length})));const controls=node('div');const prev=button(t('previous'),'button secondary small',()=>{state.routePage--;renderRoutes();$('panel-routes').focus();});prev.disabled=state.routePage===0;const next=button(t('next'),'button secondary small',()=>{state.routePage++;renderRoutes();$('panel-routes').focus();});next.disabled=state.routePage>=lastPage;append(controls,prev,next);pagination.append(controls);panel.append(pagination);}
}
function renderNodeMappings(){
  const panel=$('panel-nodes');panel.replaceChildren();panel.append(node('p','panel-intro',t('nodesIntro')));
  const table=node('table','data-table');const head=node('thead');const row=node('tr');for(const key of ['sourceNode','outputNode','nodeContent','idStatus']){const th=node('th','',t(key));th.scope='col';row.append(th);}head.append(row);table.append(head);const body=node('tbody');
  for(const mapping of state.result.manifest.nodeMappings??[]){const row=node('tr');append(row,node('td','mono',sourceLabel(mapping.moduleId,mapping.sourceNode)),node('td','mono',String(mapping.outputNode)));const module=state.modules.find(m=>m.id===mapping.moduleId);const source=module&&scenario(module).content[mapping.sourceNode];const content=node('td');append(content,node('div','',source?previewText(source):''),node('span','node-id-change',mapping.library));row.append(content);const id=node('td');append(id,node('span','',t(mapping.regenerated?'idRegenerated':'idRetained')),node('span','node-id-change',`${mapping.oldSubContentId}${mapping.regenerated?'\n→ '+mapping.newSubContentId:''}`));row.append(id);body.append(row);}table.append(body);append(panel,append(node('div','data-table-scroll'),table));
}
function renderAssets(){
  const panel=$('panel-assets');panel.replaceChildren();panel.append(node('p','panel-intro',t('assetIntro')));const rows=state.result.manifest.assetMappings??[];if(!rows.length){panel.append(node('p','empty-panel',t('assetNone')));return;}
  const grid=node('div','asset-grid');for(const asset of rows){const card=node('article','asset-card');const preview=node('div','asset-preview');const module=state.modules.find(m=>m.id===asset.moduleId);const image=module&&makeImage(module,asset.sourcePath,`${letter(asset.moduleId)} · ${asset.sourcePath}`);preview.append(image??node('span','source-note',t('imageFallback')));card.append(preview);const copy=node('div','asset-copy');const heading=node('h4');append(heading,node('span','',`${letter(asset.moduleId)} · ${module?moduleName(module):asset.moduleId}`),node('span',asset.renamed?'rename-tag':'source-note',t(asset.renamed?'assetRenamed':String(asset.reason).includes('identical')?'assetShared':'assetUnchanged')));copy.append(heading);
    for(const [key,path]of [['sourcePath',asset.sourcePath],['outputPath',asset.outputPath]]){const p=node('p','asset-path');append(p,node('span','',t(key)),document.createTextNode(path));copy.append(p);}if(asset.width&&asset.height)copy.append(node('p','asset-path',`${asset.width} × ${asset.height} · ${asset.mime}`));copy.append(node('p','asset-hash',`SHA-256\n${asset.sha256}`));
    if(asset.references?.length){const details=node('details');details.append(node('summary','source-note',t('referenceCount',{count:asset.references.length})));for(const ref of asset.references)details.append(node('p','asset-path',`${ref.sourcePointer}\n→ ${ref.outputPointer}`));copy.append(details);}card.append(copy);grid.append(card);}panel.append(grid);
}
function renderRecord(){
  const panel=$('panel-record');panel.replaceChildren();panel.append(node('p','panel-intro',t('recordIntro')));
  for(const [title,content]of [['recordStaticTitle',t('recordStatic')],['recordNativeTitle',t('recordNative')],['recordHost',`${letter(state.modules[0].id)} · ${moduleName(state.modules[0])}`],['recordHash',state.exportManifest?.output?.sha256??'']]){const section=node('div','record-group');append(section,node('h4','',t(title)),node('p',title==='recordHash'?'mono':'',content));panel.append(section);}
  const inputs=node('div','record-group');inputs.append(node('h4','',t('recordInputs')));for(const input of state.result.manifest.inputs??[]){inputs.append(node('p','mono',`${letter(input.id)} · ${input.filename}\nSHA-256 ${input.sha256}`));}panel.append(inputs);const details=node('details');details.append(node('summary','source-note',t('recordFull')));details.append(node('pre','manifest-preview',state.artifacts.manifestText));panel.append(details);
}
function selectPanel(name,focus=false){
  state.activePanel=name;for(const tab of document.querySelectorAll('[data-panel]')){const active=tab.dataset.panel===name;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$(`panel-${tab.dataset.panel}`).hidden=!active;if(active&&focus)tab.focus();}
}
function renderAll(){renderModules();renderConnections();renderResults();renderNotice();renderControls();}
function removeModule(id){
  state.modules=state.modules.filter(m=>m.id!==id);state.connections=state.connections.filter(c=>c.fromModule!==id&&c.toModule!==id);state.connections=state.connections.filter(c=>c.toModule!==state.modules[0]?.id);state.exits=eligibleExits(state.modules);invalidate();revokeAll(state.sourceUrls);renderAll();notify(state.modules.length?'removed':'removedAll');renderControls();
}
function makeHost(id){
  const at=state.modules.findIndex(m=>m.id===id);if(at<1)return;state.modules=[state.modules[at],...state.modules.filter(m=>m.id!==id)];state.connections=[];invalidate();renderAll();notify('hostChanged');
}
async function loadFiles(fileList){
  const files=Array.from(fileList??[]);if(!files.length)return;const epoch=sourceChange();state.phase='loading';renderAll();notify('loadingFiles',{count:files.length},'working');renderControls();
  try{
    if(files.length<2||files.length>5)throw uiError('fileCountError');if(files.some(f=>f.size>32*1024*1024)||files.reduce((n,f)=>n+f.size,0)>64*1024*1024)throw uiError('tooLarge');
    const modules=[];for(const [index,file]of files.entries()){if(!/\.h5p$/i.test(file.name))throw uiError('fileTypeError',{name:file.name});notify('loadingFile',{name:file.name,index:index+1,count:files.length},'working');const bytes=new Uint8Array(await file.arrayBuffer());if(epoch!==state.sourceEpoch)return;const module=await readModule(bytes,{id:`input-${epoch}-${index+1}`,filename:file.name});if(epoch!==state.sourceEpoch)return;modules.push(module);}
    if(epoch!==state.sourceEpoch)return;state.modules=modules;state.letters=new Map(modules.map((m,i)=>[m.id,String.fromCharCode(65+i)]));state.exits=eligibleExits(modules);state.phase='idle';state.dirty=true;renderAll();notify('loadSuccess',{count:modules.length});renderControls();
  }catch(error){if(epoch!==state.sourceEpoch)return;state.phase='idle';notifyError(error);renderControls();}
}
async function validate(){
  if(state.modules.length<2||state.phase!=='idle')return;const revision=++state.revision;const epoch=state.sourceEpoch;state.phase='validating';clearResult();notify('validating',{},'working');renderControls();
  try{
    const result=await compose([...state.modules],state.connections.map(c=>({...c})));if(revision!==state.revision||epoch!==state.sourceEpoch)return;
    const artifacts=await exportResult(result);if(revision!==state.revision||epoch!==state.sourceEpoch)return;
    const exportManifest=JSON.parse(artifacts.manifestText);state.result=result;state.artifacts=artifacts;state.exportManifest=exportManifest;state.resultRevision=revision;state.phase='idle';state.dirty=false;renderResults();notify('validationSuccess',{modules:result.summary.moduleCount,nodes:result.summary.nodeCount,routes:result.summary.routeCount});renderControls();
  }catch(error){if(revision!==state.revision||epoch!==state.sourceEpoch)return;state.phase='idle';clearResult();notifyError(error);renderControls();}
}
function download(kind){
  if(!state.artifacts||!state.result||state.resultRevision!==state.revision){notify('downloadUnavailable',{},'error');return;}
  const formats={h5p:{name:'branch-splice.h5p',mime:'application/zip',data:state.artifacts.h5p},manifest:{name:'branch-splice.manifest.json',mime:'application/json;charset=utf-8',data:state.artifacts.manifestText},report:{name:'branch-splice.report.txt',mime:'text/plain;charset=utf-8',data:state.artifacts.reportText}};const file=formats[kind];if(!state.exportUrls.has(kind))state.exportUrls.set(kind,URL.createObjectURL(new Blob([file.data],{type:file.mime})));
  const anchor=node('a');anchor.href=state.exportUrls.get(kind);anchor.download=file.name;anchor.hidden=true;document.body.append(anchor);anchor.click();anchor.remove();notify('downloadStarted',{name:file.name});
}
function reset(){sourceChange();$('file-input').value='';renderAll();notify('resetDone');renderControls();}
function bind(){
  for(const b of document.querySelectorAll('[data-lang]'))b.addEventListener('click',()=>{state.language=b.dataset.lang;renderLanguage();});
  for(const id of ['upload-button','choose-files-button'])$(id).addEventListener('click',()=>$('file-input').click());
  $('file-input').addEventListener('change',event=>{const files=[...event.target.files];event.target.value='';loadFiles(files);});
  const zone=$('drop-zone');let dragDepth=0;
  zone.addEventListener('dragenter',event=>{event.preventDefault();dragDepth++;zone.classList.add('dragging');});zone.addEventListener('dragover',event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';});zone.addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)zone.classList.remove('dragging');});zone.addEventListener('drop',event=>{event.preventDefault();dragDepth=0;zone.classList.remove('dragging');loadFiles(event.dataTransfer?.files);});
  document.addEventListener('dragover',event=>{if(Array.from(event.dataTransfer?.types??[]).includes('Files'))event.preventDefault();});document.addEventListener('drop',event=>{if(Array.from(event.dataTransfer?.types??[]).includes('Files'))event.preventDefault();});
  $('reset-button').addEventListener('click',reset);$('validate-button').addEventListener('click',validate);
  for(const kind of ['h5p','manifest','report'])$(`download-${kind}`).addEventListener('click',()=>download(kind));
  const tabs=[...document.querySelectorAll('[data-panel]')];for(const tab of tabs){tab.addEventListener('click',()=>selectPanel(tab.dataset.panel));tab.addEventListener('keydown',event=>{let index=tabs.indexOf(tab);if(event.key==='ArrowRight')index=(index+1)%tabs.length;else if(event.key==='ArrowLeft')index=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=tabs.length-1;else return;event.preventDefault();selectPanel(tabs[index].dataset.panel,true);});}
  window.addEventListener('pagehide',event=>{if(!event.persisted){revokeAll(state.sourceUrls);revokeAll(state.exportUrls);}});
}
bind();renderLanguage();
