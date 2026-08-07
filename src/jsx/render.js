import { HTML } from '../response.js';

export const Fragment = Symbol.for('jinatra.fragment');
const JSX = Symbol.for('jinatra.jsx');

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr',
]);

export function jsx(type, props = {}, key) {
  return { $$typeof: JSX, type, key, props: { ...props } };
}

export const jsxs = jsx;
export const jsxDEV = jsx;

export function isJSX(value) {
  return Boolean(value && value.$$typeof === JSX);
}

export async function render(value) {
  return renderValue(value);
}

async function renderValue(value) {
  if (value && typeof value.then === 'function') return renderValue(await value);
  if (value === null || value === undefined || value === false || value === true) return '';
  if (Array.isArray(value)) return (await Promise.all(value.map(renderValue))).join('');
  if (value && value[HTML]) return value.value;
  if (!isJSX(value)) return escapeHTML(String(value));

  if (value.type === Fragment) return renderValue(value.props.children);
  if (typeof value.type === 'function') {
    return renderValue(await value.type(value.props));
  }

  const tag = String(value.type);
  const props = value.props ?? {};
  let output = `<${tag}`;

  for (const [originalName, attributeValue] of Object.entries(props)) {
    if (originalName === 'children' || originalName === 'key') continue;
    if (originalName === 'dangerouslySetInnerHTML') continue;
    if (originalName.startsWith('on')) continue;
    const name = attributeName(originalName);
    const lowerName = name.toLowerCase();
    if (attributeValue === null || attributeValue === undefined || attributeValue === false) continue;
    if (attributeValue === true) {
      output += ` ${name}`;
      continue;
    }
    const attribute = originalName === 'style' && typeof attributeValue === 'object'
      ? styleString(attributeValue)
      : String(attributeValue);
    output += ` ${name}="${escapeAttribute(attribute)}"`;
  }

  output += '>';
  if (props.dangerouslySetInnerHTML?.__html != null) {
    output += String(props.dangerouslySetInnerHTML.__html);
  } else {
    output += await renderValue(props.children);
  }
  if (!VOID_ELEMENTS.has(tag.toLowerCase())) output += `</${tag}>`;
  return output;
}

function attributeName(name) {
  return {
    className: 'class',
    htmlFor: 'for',
    httpEquiv: 'http-equiv',
    acceptCharset: 'accept-charset',
    autoComplete: 'autocomplete',
    tabIndex: 'tabindex',
  }[name] ?? name;
}

function styleString(style) {
  return Object.entries(style)
    .filter(([, value]) => value !== null && value !== undefined && value !== false)
    .map(([name, value]) => `${name.startsWith('--') ? name : kebab(name)}:${value}`)
    .join(';');
}

function kebab(name) {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHTML(value);
}
