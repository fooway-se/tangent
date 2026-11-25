export type ChatSmileyIcon =
  | 'smile'
  | 'wink'
  | 'frown'
  | 'grin'
  | 'tongue'
  | 'neutral'
  | 'surprised'
  | 'uncertain'
  | 'crying'
  | 'angry'
  | 'nauseated'
  | 'coffee'
  | 'beer'
  | 'pizza'
  | 'burger'
  | 'sushi'
  | 'chinese';

export interface ChatSmileySegment {
  text: string;
  icon: ChatSmileyIcon | null;
}

const shortcutPattern = /(?<![\p{L}\p{N}_])(?::coffee:?(?![\p{L}\p{N}_])|:beer:?(?![\p{L}\p{N}_])|:pizza:?(?![\p{L}\p{N}_])|:burger:?(?![\p{L}\p{N}_])|:sushi:?(?![\p{L}\p{N}_])|:chinese:?(?![\p{L}\p{N}_])|:sick:?(?![\p{L}\p{N}_])|:'-\(|:'\(|>:-\(|>:\(|:-\)(?![\p{L}\p{N}_])|:\)(?![\p{L}\p{N}_])|;-\)(?![\p{L}\p{N}_])|;\)(?![\p{L}\p{N}_])|:-\((?![\p{L}\p{N}_])|:\((?![\p{L}\p{N}_])|:-\|(?![\p{L}\p{N}_])|:\|(?![\p{L}\p{N}_])|:-o(?![\p{L}\p{N}_])|:o(?![\p{L}\p{N}_])|:-\/(?![\p{L}\p{N}_])|:\/(?![\p{L}\p{N}_])|:-d(?![\p{L}\p{N}_])|:d(?![\p{L}\p{N}_])|:-p(?![\p{L}\p{N}_])|:p(?![\p{L}\p{N}_]))/giu;

const shortcutIcons: Readonly<Record<string, ChatSmileyIcon>> = {
  ':)': 'smile',
  ':-)': 'smile',
  ';)': 'wink',
  ';-)': 'wink',
  ':(': 'frown',
  ':-(': 'frown',
  ':d': 'grin',
  ':-d': 'grin',
  ':p': 'tongue',
  ':-p': 'tongue',
  ':|': 'neutral',
  ':-|': 'neutral',
  ':o': 'surprised',
  ':-o': 'surprised',
  ':/': 'uncertain',
  ':-/': 'uncertain',
  [":'("]: 'crying',
  [":'-("]: 'crying',
  ">:(": 'angry',
  '>:-(': 'angry',
  ':coffee': 'coffee',
  ':coffee:': 'coffee',
  ':beer': 'beer',
  ':beer:': 'beer',
  ':pizza': 'pizza',
  ':pizza:': 'pizza',
  ':burger': 'burger',
  ':burger:': 'burger',
  ':sushi': 'sushi',
  ':sushi:': 'sushi',
  ':chinese': 'chinese',
  ':chinese:': 'chinese',
  ':sick': 'nauseated',
  ':sick:': 'nauseated',
};

export function splitChatSmilies(value: string): ChatSmileySegment[] {
  const segments: ChatSmileySegment[] = [];
  let cursor = 0;
  for (const match of value.matchAll(shortcutPattern)) {
    const shortcut = match[0];
    const index = match.index;
    if (shortcut === undefined || index === undefined) continue;
    if (index > cursor) segments.push({ text: value.slice(cursor, index), icon: null });
    segments.push({ text: shortcut, icon: shortcutIcons[shortcut.toLocaleLowerCase()] ?? null });
    cursor = index + shortcut.length;
  }
  if (cursor < value.length) segments.push({ text: value.slice(cursor), icon: null });
  return segments;
}
