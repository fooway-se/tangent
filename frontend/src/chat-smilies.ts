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
  | 'laughing'
  | 'thinking'
  | 'cool'
  | 'sleeping'
  | 'facepalm'
  | 'thumbsup'
  | 'heart'
  | 'bug'
  | 'rocket'
  | 'party'
  | 'eyes'
  | 'fire'
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

const shortcutPattern = /(?<![\p{L}\p{N}_])(?::coffee:?(?![\p{L}\p{N}_])|:beer:?(?![\p{L}\p{N}_])|:pizza:?(?![\p{L}\p{N}_])|:burger:?(?![\p{L}\p{N}_])|:sushi:?(?![\p{L}\p{N}_])|:chinese:?(?![\p{L}\p{N}_])|:sick:?(?![\p{L}\p{N}_])|:\+1:?(?![\p{L}\p{N}_])|:thumbsup:?(?![\p{L}\p{N}_])|:heart:?(?![\p{L}\p{N}_])|<3(?![\p{L}\p{N}_])|:lol:?(?![\p{L}\p{N}_])|:think:?(?![\p{L}\p{N}_])|:bug:?(?![\p{L}\p{N}_])|:ship:?(?![\p{L}\p{N}_])|:rocket:?(?![\p{L}\p{N}_])|:tada:?(?![\p{L}\p{N}_])|:party:?(?![\p{L}\p{N}_])|:cool:?(?![\p{L}\p{N}_])|:zzz:?(?![\p{L}\p{N}_])|:sleep:?(?![\p{L}\p{N}_])|:eyes:?(?![\p{L}\p{N}_])|:fire:?(?![\p{L}\p{N}_])|:facepalm:?(?![\p{L}\p{N}_])|:'-\(|:'\(|>:-\(|>:\(|:-\)(?![\p{L}\p{N}_])|:\)(?![\p{L}\p{N}_])|;-\)(?![\p{L}\p{N}_])|;\)(?![\p{L}\p{N}_])|:-\((?![\p{L}\p{N}_])|:\((?![\p{L}\p{N}_])|:-\|(?![\p{L}\p{N}_])|:\|(?![\p{L}\p{N}_])|:-o(?![\p{L}\p{N}_])|:o(?![\p{L}\p{N}_])|:-\/(?![\p{L}\p{N}_])|:\/(?![\p{L}\p{N}_])|:-d(?![\p{L}\p{N}_])|:d(?![\p{L}\p{N}_])|:-p(?![\p{L}\p{N}_])|:p(?![\p{L}\p{N}_]))/giu;

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
  ':+1': 'thumbsup',
  ':+1:': 'thumbsup',
  ':thumbsup': 'thumbsup',
  ':thumbsup:': 'thumbsup',
  ':heart': 'heart',
  ':heart:': 'heart',
  '<3': 'heart',
  ':lol': 'laughing',
  ':lol:': 'laughing',
  ':think': 'thinking',
  ':think:': 'thinking',
  ':bug': 'bug',
  ':bug:': 'bug',
  ':ship': 'rocket',
  ':ship:': 'rocket',
  ':rocket': 'rocket',
  ':rocket:': 'rocket',
  ':tada': 'party',
  ':tada:': 'party',
  ':party': 'party',
  ':party:': 'party',
  ':cool': 'cool',
  ':cool:': 'cool',
  ':zzz': 'sleeping',
  ':zzz:': 'sleeping',
  ':sleep': 'sleeping',
  ':sleep:': 'sleeping',
  ':eyes': 'eyes',
  ':eyes:': 'eyes',
  ':fire': 'fire',
  ':fire:': 'fire',
  ':facepalm': 'facepalm',
  ':facepalm:': 'facepalm',
};

export interface ChatSmileyCatalogEntry {
  icon: ChatSmileyIcon;
  /** Text codes that produce the icon. The first one is inserted by the palette. */
  codes: readonly string[];
}

export interface ChatSmileyGroup {
  id: string;
  label: string;
  entries: readonly ChatSmileyCatalogEntry[];
}

export const chatSmileyShortcuts: Readonly<Record<string, ChatSmileyIcon>> = shortcutIcons;

export const chatSmileyGroups: readonly ChatSmileyGroup[] = [
  {
    id: 'faces',
    label: 'Faces',
    entries: [
      { icon: 'smile', codes: [':)', ':-)'] },
      { icon: 'wink', codes: [';)', ';-)'] },
      { icon: 'frown', codes: [':(', ':-('] },
      { icon: 'grin', codes: [':D', ':-D'] },
      { icon: 'tongue', codes: [':P', ':-P'] },
      { icon: 'neutral', codes: [':|', ':-|'] },
      { icon: 'surprised', codes: [':o', ':-o'] },
      { icon: 'uncertain', codes: [':/', ':-/'] },
      { icon: 'crying', codes: [":'(", ":'-("] },
      { icon: 'angry', codes: ['>:(', '>:-('] },
      { icon: 'nauseated', codes: [':sick'] },
      { icon: 'laughing', codes: [':lol'] },
      { icon: 'thinking', codes: [':think'] },
      { icon: 'cool', codes: [':cool'] },
      { icon: 'sleeping', codes: [':zzz', ':sleep'] },
      { icon: 'facepalm', codes: [':facepalm'] },
    ],
  },
  {
    id: 'reactions',
    label: 'Reactions',
    entries: [
      { icon: 'thumbsup', codes: [':+1', ':thumbsup'] },
      { icon: 'heart', codes: [':heart', '<3'] },
      { icon: 'eyes', codes: [':eyes'] },
      { icon: 'fire', codes: [':fire'] },
      { icon: 'party', codes: [':tada', ':party'] },
      { icon: 'rocket', codes: [':ship', ':rocket'] },
      { icon: 'bug', codes: [':bug'] },
    ],
  },
  {
    id: 'food',
    label: 'Food & drink',
    entries: [
      { icon: 'coffee', codes: [':coffee'] },
      { icon: 'beer', codes: [':beer'] },
      { icon: 'pizza', codes: [':pizza'] },
      { icon: 'burger', codes: [':burger'] },
      { icon: 'sushi', codes: [':sushi'] },
      { icon: 'chinese', codes: [':chinese'] },
    ],
  },
];

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
