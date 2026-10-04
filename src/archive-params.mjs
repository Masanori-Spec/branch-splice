import { fail, LIMITS } from './archive-errors.mjs';
import { safePath } from './archive-zip.mjs';
import { validateRichHtml, validateImageText, rejectHiddenLibraries } from './archive-html.mjs';
import { validateNodeMetadata, validateCopyright } from './archive-metadata.mjs';

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
export function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('PARAMS_TYPE', `${label} must be an object`);
  return value;
}
function keys(value, allowed, label) {
  object(value, label);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('PARAMS_UNSUPPORTED', `Unsupported field ${label}.${key}`);
}
function textFields(value, fields, label) {
  for (const field of fields) if (own(value, field) && typeof value[field] !== 'string') fail('PARAMS_TYPE', `${label}.${field} must be text`);
}
function booleans(value, fields, label) {
  for (const field of fields) if (own(value, field) && typeof value[field] !== 'boolean') fail('PARAMS_TYPE', `${label}.${field} must be boolean`);
}
export const NODE_LIBRARIES = Object.freeze(['H5P.AdvancedText 1.1', 'H5P.BranchingQuestion 1.0', 'H5P.Image 1.1']);

export function validateParams(params) {
  rejectHiddenLibraries(params, true);
  keys(params, ['branchingScenario'], 'params');
  const scenario = object(params.branchingScenario, 'branchingScenario');
  keys(scenario, ['title', 'content', 'startScreen', 'endScreens', 'scoringOptionGroup', 'behaviour', 'l10n'], 'branchingScenario');
  textFields(scenario, ['title'], 'branchingScenario');
  if (scenario.title !== undefined) validateRichHtml(scenario.title, 'branchingScenario.title');
  const nodes = scenario.content;
  if (!Array.isArray(nodes) || !nodes.length || nodes.length > LIMITS.nodes) fail('GRAPH_NODE_LIMIT', 'A module must contain 1–60 nodes');
  const refs = [], usedLibraries = new Set(['H5P.BranchingScenario-1.8']), ids = new Set(), edges = [];
  function image(descriptor, pointer, original = false) {
    keys(descriptor, original ? ['path', 'mime', 'copyright', 'width', 'height'] : ['path', 'mime', 'copyright', 'width', 'height', 'originalImage'], pointer.join('.'));
    const path = descriptor.path;
    safePath(path);
    if (!path.startsWith('images/') || path.startsWith('content/') || !/^images\/.+\.(png|jpe?g|gif|webp)$/i.test(path)) fail('IMAGE_PATH', `Only local PNG/JPEG/GIF/WebP image paths are supported: ${path}`);
    if (descriptor.mime !== undefined && !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(descriptor.mime)) fail('IMAGE_MIME', `Unsupported image MIME type at ${pointer.join('.')}`);
    for (const dimension of ['width', 'height']) if (descriptor[dimension] !== undefined && (!Number.isInteger(descriptor[dimension]) || descriptor[dimension] < 1 || descriptor[dimension] > LIMITS.dimension)) fail('IMAGE_DIMENSION', `Invalid image ${dimension} at ${pointer.join('.')}`);
    if (descriptor.copyright !== undefined) validateCopyright(descriptor.copyright, `${pointer.join('.')}.copyright`);
    refs.push({ pointer: [...pointer], path });
    if (descriptor.originalImage !== undefined) image(descriptor.originalImage, [...pointer, 'originalImage'], true);
  }
  function feedback(value, pointer) {
    // The pinned native player dereferences this object on every proceed/choice.
    // Require the authored slot; never synthesize feedback to repair an input.
    object(value, pointer.join('.'));
    if (own(value, 'endScreenScore')) fail('SCORING_UNSUPPORTED', `Feedback score fields are not supported: ${pointer.join('.')}`);
    keys(value, ['title', 'subtitle', 'image'], pointer.join('.'));
    textFields(value, ['title', 'subtitle'], pointer.join('.'));
    for (const field of ['title', 'subtitle']) if (value[field] !== undefined) validateRichHtml(value[field], [...pointer, field].join('.'));
    if (value.image !== undefined) image(value.image, [...pointer, 'image']);
  }
  const scoring = object(scenario.scoringOptionGroup, 'scoringOptionGroup');
  keys(scoring, ['scoringOption', 'includeInteractionsScores'], 'scoringOptionGroup');
  if (scoring.scoringOption !== 'no-score') fail('SCORING_UNSUPPORTED', 'Only no-score scenarios are supported');
  booleans(scoring, ['includeInteractionsScores'], 'scoringOptionGroup');
  const behaviour = scenario.behaviour === undefined ? {} : object(scenario.behaviour, 'behaviour');
  keys(behaviour, ['enableBackwardsNavigation', 'forceContentFinished', 'randomizeBranchingQuestions'], 'behaviour');
  for (const [key, value] of Object.entries(behaviour)) if (value !== false) fail('BEHAVIOUR_UNSUPPORTED', `${key} must be false`);
  if (scenario.l10n !== undefined) {
    const fields = ['startScreenButtonText', 'endScreenButtonText', 'backButtonText', 'disableProceedButtonText', 'replayButtonText', 'scoreText', 'fullscreenAria'];
    keys(scenario.l10n, fields, 'l10n'); textFields(scenario.l10n, fields, 'l10n');
  }
  if (scenario.startScreen !== undefined) {
    const start = scenario.startScreen, fields = ['startScreenTitle', 'startScreenSubtitle', 'startScreenImage', 'startScreenAltText'];
    keys(start, fields, 'startScreen'); textFields(start, fields.filter(key => key !== 'startScreenImage'), 'startScreen');
    for (const field of ['startScreenTitle', 'startScreenSubtitle']) if (start[field] !== undefined) validateRichHtml(start[field], `startScreen.${field}`);
    if (start.startScreenImage !== undefined) image(start.startScreenImage, ['branchingScenario', 'startScreen', 'startScreenImage']);
  }
  if (!Array.isArray(scenario.endScreens) || scenario.endScreens.length !== 1) fail('ENDING_UNSUPPORTED', 'Exactly one shared default ending is supported');
  const ending = scenario.endScreens[0];
  keys(ending, ['endScreenTitle', 'endScreenSubtitle', 'endScreenImage', 'endScreenScore', 'contentId'], 'endScreens[0]');
  textFields(ending, ['endScreenTitle', 'endScreenSubtitle'], 'endScreens[0]');
  for (const field of ['endScreenTitle', 'endScreenSubtitle']) if (ending[field] !== undefined) validateRichHtml(ending[field], `endScreens[0].${field}`);
  if (ending.contentId !== -1 || (own(ending, 'endScreenScore') && ending.endScreenScore !== 0)) fail('ENDING_UNSUPPORTED', 'The default ending must have contentId -1 and no nonzero score');
  if (ending.endScreenImage !== undefined) image(ending.endScreenImage, ['branchingScenario', 'endScreens', 0, 'endScreenImage']);
  function target(value, label) {
    if (!Number.isInteger(value) || value < -1 || value >= nodes.length) fail('GRAPH_TARGET', `${label} must point to an existing node or default ending -1`);
    return value;
  }
  nodes.forEach((node, index) => {
    const pointer = ['branchingScenario', 'content', index], label = `content[${index}]`;
    keys(node, ['type', 'showContentTitle', 'proceedButtonText', 'forceContentFinished', 'feedback', 'contentBehaviour', 'nextContentId'], label);
    booleans(node, ['showContentTitle'], label); textFields(node, ['proceedButtonText'], label);
    if (node.proceedButtonText !== undefined) validateRichHtml(node.proceedButtonText, `${label}.proceedButtonText`);
    for (const field of ['forceContentFinished', 'contentBehaviour']) if (own(node, field) && !['useBehavioural', 'disabled'].includes(node[field])) fail('BEHAVIOUR_UNSUPPORTED', `${label}.${field} enables unsupported navigation or forced completion`);
    const type = node.type;
    keys(type, ['library', 'params', 'subContentId', 'metadata'], `${label}.type`);
    if (!NODE_LIBRARIES.includes(type.library)) fail('NODE_LIBRARY', `Unsupported content library: ${type.library}`);
    if (typeof type.subContentId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(type.subContentId)) fail('SUBCONTENT_ID', `${label} requires a UUID subContentId`);
    const id = type.subContentId.toLowerCase();
    if (ids.has(id)) fail('SUBCONTENT_DUPLICATE', `Duplicate subContentId within this input: ${type.subContentId}`);
    ids.add(id);
    if (type.metadata !== undefined) validateNodeMetadata(type.metadata, `${label}.type.metadata`);
    const [machine, version] = type.library.split(' ');
    usedLibraries.add(`${machine}-${version}`);
    feedback(node.feedback, [...pointer, 'feedback']);
    if (type.library === 'H5P.BranchingQuestion 1.0') {
      if (own(node, 'nextContentId')) fail('GRAPH_TARGET', 'BranchingQuestion routing must use alternatives, without an outer nextContentId');
      keys(type.params, ['branchingQuestion'], `${label}.type.params`);
      const question = type.params.branchingQuestion;
      keys(question, ['question', 'alternatives'], `${label}.branchingQuestion`);
      textFields(question, ['question'], `${label}.branchingQuestion`);
      if (question.question !== undefined) validateRichHtml(question.question, `${label}.question`);
      if (!Array.isArray(question.alternatives) || question.alternatives.length < 2 || question.alternatives.length > LIMITS.routes) fail('GRAPH_CHOICES', `${label} must have 2–512 alternatives`);
      edges[index] = question.alternatives.map((alternative, alternativeIndex) => {
        keys(alternative, ['text', 'nextContentId', 'feedback'], `${label}.alternatives[${alternativeIndex}]`);
        if (typeof alternative.text !== 'string') fail('PARAMS_TYPE', 'Choice labels must be text');
        validateRichHtml(alternative.text, `${label}.alternatives[${alternativeIndex}].text`);
        feedback(alternative.feedback, [...pointer, 'type', 'params', 'branchingQuestion', 'alternatives', alternativeIndex, 'feedback']);
        return { target: target(alternative.nextContentId, `${label} alternative ${alternativeIndex}`), choice: { node: index, alternative: alternativeIndex, label: alternative.text } };
      });
    } else {
      if (type.library === 'H5P.AdvancedText 1.1') {
        keys(type.params, ['text'], `${label}.type.params`);
        if (typeof type.params.text !== 'string') fail('PARAMS_TYPE', 'AdvancedText requires a text string');
        validateRichHtml(type.params.text, `${label}.text`);
      } else {
        keys(type.params, ['file', 'decorative', 'alt', 'title', 'contentName', 'expandImage', 'minimizeImage'], `${label}.type.params`);
        booleans(type.params, ['decorative'], `${label}.type.params`);
        textFields(type.params, ['title', 'contentName', 'expandImage', 'minimizeImage'], `${label}.type.params`);
        if (own(type.params, 'alt') && !(type.params.decorative === true && type.params.alt === null) && typeof type.params.alt !== 'string') fail('PARAMS_TYPE', `${label}.type.params.alt must be text, or null for a decorative image`);
        for (const field of ['alt', 'title']) if (typeof type.params[field] === 'string') validateImageText(type.params[field], `${label}.type.params.${field}`);
        // Core's copyright thumbnail interpolates the original alt into a quoted attribute.
        if (typeof type.params.alt === 'string' && /["<>]/.test(type.params.alt)) fail('HTML_UNSUPPORTED', `${label}.type.params.alt contains unsupported thumbnail attribute characters`);
        image(type.params.file, [...pointer, 'type', 'params', 'file']);
      }
      edges[index] = [{ target: target(node.nextContentId, label), choice: null }];
    }
  });
  const colours = new Uint8Array(nodes.length);
  function visit(index) {
    if (colours[index] === 1) fail('GRAPH_CYCLE', 'Cycles or backward navigation are not supported');
    if (colours[index] === 2) return;
    colours[index] = 1;
    for (const edge of edges[index]) if (edge.target >= 0) visit(edge.target);
    colours[index] = 2;
  }
  visit(0);
  if (colours.some(colour => colour !== 2)) fail('GRAPH_UNREACHABLE', 'Every node must be reachable from entry node 0');
  const routes = [];
  function enumerate(index, path, choices) {
    const nextPath = [...path, index];
    for (const edge of edges[index]) {
      const nextChoices = edge.choice ? [...choices, edge.choice] : choices;
      if (edge.target === -1) {
        routes.push({ nodes: nextPath, choices: nextChoices });
        if (routes.length > LIMITS.routes) fail('GRAPH_ROUTE_LIMIT', 'The module exceeds 512 complete choice routes');
      } else enumerate(edge.target, nextPath, nextChoices);
    }
  }
  enumerate(0, [], []);
  return { typedImageRefs: refs, routes, usedLibraries };
}
