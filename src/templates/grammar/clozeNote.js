export function buildClozeNoteFields({
  text,
  extra = '',
  fieldMap = { textField: 'Text', extraField: 'Back Extra' },
}) {
  return {
    [fieldMap.textField]: text,
    [fieldMap.extraField]: extra,
  };
}
