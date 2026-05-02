export function html(strings, ...values) {
  return strings.reduce((result, part, index) => {
    return result + part + (values[index] ?? '');
  }, '').trim();
}

export function joinHtml(parts = [], separator = '<br>') {
  return parts.filter(Boolean).join(separator);
}
