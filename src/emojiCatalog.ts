export interface EmojiEntry {
  char: string;
  name: string;
  keywords: string;
}

export interface EmojiCategory {
  title: string;
  emojis: EmojiEntry[];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    title: 'Smileys & Emotion',
    emojis: [
      { char: '😀', name: 'grinning', keywords: 'happy smile face' },
      { char: '😃', name: 'smiley', keywords: 'happy joy grin' },
      { char: '😄', name: 'smile', keywords: 'happy laugh' },
      { char: '😁', name: 'grin', keywords: 'teeth happy' },
      { char: '😆', name: 'laughing', keywords: 'xd lol happy' },
      { char: '😅', name: 'sweat_smile', keywords: 'nervous relief' },
      { char: '🤣', name: 'rofl', keywords: 'laughing crying floor' },
      { char: '😂', name: 'joy', keywords: 'laugh crying lol' },
      { char: '🙂', name: 'slightly_smiling_face', keywords: 'ok fine smile' },
      { char: '🙃', name: 'upside_down_face', keywords: 'silly sarcasm' },
      { char: '😉', name: 'wink', keywords: 'flirt joke' },
      { char: '😊', name: 'blush', keywords: 'happy cute warm' },
      { char: '😇', name: 'innocent', keywords: 'angel halo' },
      { char: '🥰', name: 'smiling_face_with_3_hearts', keywords: 'love adore' },
      { char: '😍', name: 'heart_eyes', keywords: 'love crush' },
      { char: '🤩', name: 'star_struck', keywords: 'wow amazed' },
      { char: '😘', name: 'kissing_heart', keywords: 'kiss love' },
      { char: '😗', name: 'kissing', keywords: 'kiss' },
      { char: '😚', name: 'kissing_closed_eyes', keywords: 'kiss' },
      { char: '😋', name: 'yum', keywords: 'delicious tasty' },
      { char: '😛', name: 'stuck_out_tongue', keywords: 'playful' },
      { char: '😜', name: 'stuck_out_tongue_winking_eye', keywords: 'crazy silly' },
      { char: '🤪', name: 'zany_face', keywords: 'goofy crazy' },
      { char: '😝', name: 'stuck_out_tongue_closed_eyes', keywords: 'silly' },
      { char: '🤑', name: 'money_mouth_face', keywords: 'rich dollar' },
      { char: '🤗', name: 'hugging', keywords: 'hug warm' },
      { char: '🤭', name: 'hand_over_mouth', keywords: 'oops giggle' },
      { char: '🤫', name: 'shushing_face', keywords: 'quiet secret shh' },
      { char: '🤔', name: 'thinking', keywords: 'hmm think wonder' },
      { char: '🫡', name: 'saluting_face', keywords: 'salute yes sir respect' },
      { char: '🤐', name: 'zipper_mouth_face', keywords: 'quiet zip' },
      { char: '🤨', name: 'raised_eyebrow', keywords: 'sus rock skeptical' },
      { char: '😐', name: 'neutral_face', keywords: 'meh blank' },
      { char: '😑', name: 'expressionless', keywords: 'blank deadpan' },
      { char: '😶', name: 'no_mouth', keywords: 'speechless silent' },
      { char: '🫥', name: 'dotted_line_face', keywords: 'invisible disappear' },
      { char: '😏', name: 'smirk', keywords: 'smug sly' },
      { char: '😒', name: 'unamused', keywords: 'annoyed meh' },
      { char: '🙄', name: 'rolling_eyes', keywords: 'eyeroll whatever' },
      { char: '😬', name: 'grimacing', keywords: 'awkward yikes' },
      { char: '🤥', name: 'lying_face', keywords: 'pinocchio lie' },
      { char: '😌', name: 'relieved', keywords: 'calm peace' },
      { char: '😔', name: 'pensive', keywords: 'sad down disappointed' },
      { char: '😪', name: 'sleepy', keywords: 'tired snot' },
      { char: '🤤', name: 'drooling_face', keywords: 'drool want' },
      { char: '😴', name: 'sleeping', keywords: 'zzz sleep tired' },
      { char: '😷', name: 'mask', keywords: 'sick medical' },
      { char: '🤒', name: 'thermometer_face', keywords: 'sick fever' },
      { char: '🤕', name: 'head_bandage', keywords: 'hurt injured' },
      { char: '🤢', name: 'nauseated_face', keywords: 'gross sick' },
      { char: '🤮', name: 'vomiting_face', keywords: 'puke gross' },
      { char: '🤧', name: 'sneezing_face', keywords: 'achoo cold' },
      { char: '🥵', name: 'hot_face', keywords: 'hot sweat heat' },
      { char: '🥶', name: 'cold_face', keywords: 'freezing cold ice' },
      { char: '🥴', name: 'woozy_face', keywords: 'dizzy drunk' },
      { char: '😵', name: 'dizzy_face', keywords: 'ko dead dizzy' },
      { char: '🤯', name: 'exploding_head', keywords: 'mind blown shocked' },
      { char: '🤠', name: 'cowboy', keywords: 'yeehaw hat' },
      { char: '🥳', name: 'partying_face', keywords: 'party celebrate birthday' },
      { char: '🥸', name: 'disguised_face', keywords: 'glasses mustache' },
      { char: '😎', name: 'sunglasses', keywords: 'cool shades' },
      { char: '🤓', name: 'nerd_face', keywords: 'nerd glasses geek' },
      { char: '🧐', name: 'monocle_face', keywords: 'inspect fancy' },
      { char: '😕', name: 'confused', keywords: 'unsure huh' },
      { char: '🫤', name: 'face_with_diagonal_mouth', keywords: 'meh skeptical' },
      { char: '😟', name: 'worried', keywords: 'anxious concern' },
      { char: '🙁', name: 'slightly_frowning_face', keywords: 'sad frown' },
      { char: '☹️', name: 'frowning_face', keywords: 'sad' },
      { char: '😮', name: 'open_mouth', keywords: 'surprised oh' },
      { char: '😯', name: 'hushed', keywords: 'surprised' },
      { char: '😲', name: 'astonished', keywords: 'shocked wow' },
      { char: '😳', name: 'flushed', keywords: 'embarrassed blushing wide' },
      { char: '🥺', name: 'pleading_face', keywords: 'puppy please beg' },
      { char: '🥹', name: 'face_holding_back_tears', keywords: 'cry emotional proud' },
      { char: '😦', name: 'frowning_open_mouth', keywords: 'shocked' },
      { char: '😧', name: 'anguished', keywords: 'stressed' },
      { char: '😨', name: 'fearful', keywords: 'scared fear' },
      { char: '😰', name: 'cold_sweat', keywords: 'nervous worried' },
      { char: '😥', name: 'disappointed_relieved', keywords: 'sad sweat' },
      { char: '😢', name: 'cry', keywords: 'crying_face sad tear' },
      { char: '😭', name: 'sob', keywords: 'crying tears loud' },
      { char: '😱', name: 'scream', keywords: 'scared omg horror' },
      { char: '😖', name: 'confounded', keywords: 'frustrated' },
      { char: '😣', name: 'persevere', keywords: 'struggle' },
      { char: '😞', name: 'disappointed', keywords: 'sad' },
      { char: '😓', name: 'sweat', keywords: 'tired hard' },
      { char: '😩', name: 'weary', keywords: 'tired ugh' },
      { char: '😫', name: 'tired_face', keywords: 'exhausted' },
      { char: '🥱', name: 'yawning_face', keywords: 'bored sleepy' },
      { char: '😤', name: 'triumph', keywords: 'huff proud mad' },
      { char: '😡', name: 'rage', keywords: 'angry mad red' },
      { char: '😠', name: 'angry', keywords: 'mad upset' },
      { char: '🤬', name: 'cursing_face', keywords: 'swear mad' },
      { char: '😈', name: 'smiling_imp', keywords: 'devil evil mischief' },
      { char: '👿', name: 'imp', keywords: 'devil angry' },
      { char: '💀', name: 'skull', keywords: 'dead rip lmao' },
      { char: '☠️', name: 'skull_and_crossbones', keywords: 'pirate dead' },
      { char: '💩', name: 'poop', keywords: 'shit' },
      { char: '🤡', name: 'clown', keywords: 'clown joke fool' },
      { char: '👹', name: 'japanese_ogre', keywords: 'oni demon' },
      { char: '👻', name: 'ghost', keywords: 'spooky boo' },
      { char: '👽', name: 'alien', keywords: 'ufo space' },
      { char: '🤖', name: 'robot', keywords: 'bot ai' },
      { char: '😺', name: 'smiley_cat', keywords: 'cat happy' },
      { char: '😸', name: 'smile_cat', keywords: 'cat grin' },
      { char: '😹', name: 'joy_cat', keywords: 'cat lol' },
      { char: '😻', name: 'heart_eyes_cat', keywords: 'cat love' },
      { char: '😼', name: 'smirk_cat', keywords: 'cat smug' },
      { char: '😿', name: 'crying_cat_face', keywords: 'cat sad' },
      { char: '🙈', name: 'see_no_evil', keywords: 'monkey oops' },
      { char: '🙉', name: 'hear_no_evil', keywords: 'monkey' },
      { char: '🙊', name: 'speak_no_evil', keywords: 'monkey' },
    ],
  },
  {
    title: 'Gestures & People',
    emojis: [
      { char: '👋', name: 'wave', keywords: 'hello hi bye' },
      { char: '🤚', name: 'raised_back_of_hand', keywords: 'stop hand' },
      { char: '🖐️', name: 'hand_splayed', keywords: 'five high' },
      { char: '✋', name: 'raised_hand', keywords: 'stop high five' },
      { char: '🖖', name: 'vulcan_salute', keywords: 'spock' },
      { char: '👌', name: 'ok_hand', keywords: 'okay nice perfect' },
      { char: '🤌', name: 'pinched_fingers', keywords: 'italian chef kiss' },
      { char: '🤏', name: 'pinching_hand', keywords: 'tiny small' },
      { char: '✌️', name: 'v', keywords: 'peace victory two' },
      { char: '🤞', name: 'fingers_crossed', keywords: 'luck hope' },
      { char: '🫰', name: 'hand_with_index_finger_and_thumb_crossed', keywords: 'heart snap money' },
      { char: '🤟', name: 'love_you_gesture', keywords: 'rock love' },
      { char: '🤘', name: 'metal', keywords: 'rock horns' },
      { char: '🤙', name: 'call_me', keywords: 'shaka hang loose' },
      { char: '👈', name: 'point_left', keywords: 'left' },
      { char: '👉', name: 'point_right', keywords: 'right' },
      { char: '👆', name: 'point_up_2', keywords: 'up this' },
      { char: '👇', name: 'point_down', keywords: 'down' },
      { char: '☝️', name: 'point_up', keywords: 'nerd um actually' },
      { char: '👍', name: 'thumbsup', keywords: 'yes good like +1' },
      { char: '👎', name: 'thumbsdown', keywords: 'no bad dislike -1' },
      { char: '✊', name: 'fist', keywords: 'power punch' },
      { char: '👊', name: 'punch', keywords: 'brofist hit' },
      { char: '🤛', name: 'left_facing_fist', keywords: 'bump' },
      { char: '🤜', name: 'right_facing_fist', keywords: 'bump' },
      { char: '👏', name: 'clap', keywords: 'applause bravo' },
      { char: '🙌', name: 'raised_hands', keywords: 'hooray praise' },
      { char: '🫶', name: 'heart_hands', keywords: 'love hands' },
      { char: '🤝', name: 'handshake', keywords: 'deal agree' },
      { char: '🙏', name: 'pray', keywords: 'please thanks hope amen' },
      { char: '💪', name: 'muscle', keywords: 'strong flex gym' },
      { char: '🧠', name: 'brain', keywords: 'smart big mind' },
      { char: '👀', name: 'eyes', keywords: 'look see watching' },
      { char: '👁️', name: 'eye', keywords: 'look see watch' },
      { char: '🫂', name: 'people_hugging', keywords: 'hug comfort' },
    ],
  },
  {
    title: 'Hearts & Symbols',
    emojis: [
      { char: '❤️', name: 'heart', keywords: 'red love' },
      { char: '🩷', name: 'pink_heart', keywords: 'love pink' },
      { char: '🧡', name: 'orange_heart', keywords: 'love' },
      { char: '💛', name: 'yellow_heart', keywords: 'love' },
      { char: '💚', name: 'green_heart', keywords: 'love' },
      { char: '🩵', name: 'light_blue_heart', keywords: 'love' },
      { char: '💙', name: 'blue_heart', keywords: 'love' },
      { char: '💜', name: 'purple_heart', keywords: 'love' },
      { char: '🖤', name: 'black_heart', keywords: 'dark love' },
      { char: '🤍', name: 'white_heart', keywords: 'pure love' },
      { char: '💔', name: 'broken_heart', keywords: 'sad heartbreak' },
      { char: '❤️‍🔥', name: 'heart_on_fire', keywords: 'passion fire love' },
      { char: '💖', name: 'sparkling_heart', keywords: 'love sparkle' },
      { char: '💘', name: 'cupid', keywords: 'love arrow' },
      { char: '💯', name: '100', keywords: 'hundred true real facts' },
      { char: '💢', name: 'anger', keywords: 'mad comic' },
      { char: '💥', name: 'boom', keywords: 'explosion crash' },
      { char: '💫', name: 'dizzy', keywords: 'star sparkle' },
      { char: '💦', name: 'sweat_drops', keywords: 'water splash' },
      { char: '💨', name: 'dash', keywords: 'fast wind run' },
      { char: '💬', name: 'speech_balloon', keywords: 'chat talk' },
      { char: '💭', name: 'thought_balloon', keywords: 'think' },
      { char: '💤', name: 'zzz', keywords: 'sleep' },
      { char: '✅', name: 'white_check_mark', keywords: 'check yes done green' },
      { char: '❌', name: 'x', keywords: 'no cross cancel wrong red' },
      { char: '❓', name: 'question', keywords: 'what red' },
      { char: '❗', name: 'exclamation', keywords: 'alert important' },
      { char: '⚠️', name: 'warning', keywords: 'alert caution' },
      { char: '🚫', name: 'no_entry_sign', keywords: 'ban forbidden' },
      { char: '⭐', name: 'star', keywords: 'favorite gold' },
      { char: '🌟', name: 'star2', keywords: 'glowing star' },
      { char: '✨', name: 'sparkles', keywords: 'magic shine' },
      { char: '⚡', name: 'zap', keywords: 'lightning electric fast' },
      { char: '🔥', name: 'fire', keywords: 'lit flame hot' },
      { char: '❄️', name: 'snowflake', keywords: 'cold winter snow' },
      { char: '🌈', name: 'rainbow', keywords: 'color pride' },
      { char: '🎉', name: 'tada', keywords: 'party celebrate confetti' },
      { char: '🎊', name: 'confetti_ball', keywords: 'celebrate' },
      { char: '🏆', name: 'trophy', keywords: 'win winner gold' },
      { char: '🥇', name: 'first_place', keywords: 'gold win' },
      { char: '🎮', name: 'video_game', keywords: 'gaming controller play' },
      { char: '🕹️', name: 'joystick', keywords: 'arcade game' },
      { char: '🎲', name: 'game_die', keywords: 'dice luck' },
      { char: '🎵', name: 'musical_note', keywords: 'music song' },
      { char: '🎶', name: 'notes', keywords: 'music' },
      { char: '🎧', name: 'headphones', keywords: 'music audio' },
      { char: '🔔', name: 'bell', keywords: 'notify alert' },
      { char: '📌', name: 'pushpin', keywords: 'pin' },
      { char: '🔒', name: 'lock', keywords: 'locked private' },
      { char: '🔑', name: 'key', keywords: 'unlock' },
      { char: '🚀', name: 'rocket', keywords: 'space launch fast' },
      { char: '💎', name: 'gem', keywords: 'diamond jewel' },
      { char: '👑', name: 'crown', keywords: 'king queen royal' },
      { char: '🚩', name: 'triangular_flag_on_post', keywords: 'red flag' },
    ],
  },
  {
    title: 'Animals & Nature',
    emojis: [
      { char: '🐶', name: 'dog', keywords: 'puppy pet' },
      { char: '🐱', name: 'cat', keywords: 'kitty pet' },
      { char: '🐭', name: 'mouse', keywords: 'rat' },
      { char: '🐹', name: 'hamster', keywords: 'cute' },
      { char: '🐰', name: 'rabbit', keywords: 'bunny' },
      { char: '🦊', name: 'fox', keywords: 'animal' },
      { char: '🐻', name: 'bear', keywords: 'animal' },
      { char: '🐼', name: 'panda_face', keywords: 'bear' },
      { char: '🐨', name: 'koala', keywords: 'animal' },
      { char: '🐯', name: 'tiger', keywords: 'cat' },
      { char: '🦁', name: 'lion', keywords: 'king' },
      { char: '🐮', name: 'cow', keywords: 'moo' },
      { char: '🐷', name: 'pig', keywords: 'oink' },
      { char: '🐸', name: 'frog', keywords: 'ribbit pepe' },
      { char: '🐵', name: 'monkey_face', keywords: 'ape' },
      { char: '🐔', name: 'chicken', keywords: 'bird' },
      { char: '🐧', name: 'penguin', keywords: 'cold' },
      { char: '🐦', name: 'bird', keywords: 'tweet' },
      { char: '🦆', name: 'duck', keywords: 'quack' },
      { char: '🦅', name: 'eagle', keywords: 'bird' },
      { char: '🦉', name: 'owl', keywords: 'night' },
      { char: '🦇', name: 'bat', keywords: 'night' },
      { char: '🐺', name: 'wolf', keywords: 'howl' },
      { char: '🐝', name: 'bee', keywords: 'honey' },
      { char: '🦋', name: 'butterfly', keywords: 'insect' },
      { char: '🐢', name: 'turtle', keywords: 'slow' },
      { char: '🐍', name: 'snake', keywords: 'slither' },
      { char: '🦖', name: 't_rex', keywords: 'dinosaur' },
      { char: '🐙', name: 'octopus', keywords: 'sea' },
      { char: '🦈', name: 'shark', keywords: 'ocean' },
      { char: '🐬', name: 'dolphin', keywords: 'sea' },
      { char: '🐉', name: 'dragon', keywords: 'fire fantasy' },
      { char: '🌸', name: 'cherry_blossom', keywords: 'flower pink' },
      { char: '🌹', name: 'rose', keywords: 'flower red love' },
      { char: '🌻', name: 'sunflower', keywords: 'flower' },
      { char: '🌲', name: 'evergreen_tree', keywords: 'pine forest' },
      { char: '🍀', name: 'four_leaf_clover', keywords: 'luck green' },
      { char: '☀️', name: 'sunny', keywords: 'sun weather' },
      { char: '🌙', name: 'crescent_moon', keywords: 'night moon' },
      { char: '🌧️', name: 'cloud_rain', keywords: 'rain weather' },
      { char: '🌊', name: 'ocean', keywords: 'wave water' },
    ],
  },
  {
    title: 'Food & Drink',
    emojis: [
      { char: '🍎', name: 'apple', keywords: 'fruit red' },
      { char: '🍓', name: 'strawberry', keywords: 'fruit berry' },
      { char: '🍒', name: 'cherries', keywords: 'fruit red' },
      { char: '🍉', name: 'watermelon', keywords: 'fruit summer' },
      { char: '🍌', name: 'banana', keywords: 'fruit' },
      { char: '🍋', name: 'lemon', keywords: 'citrus' },
      { char: '🥑', name: 'avocado', keywords: 'green' },
      { char: '🍕', name: 'pizza', keywords: 'food slice' },
      { char: '🍔', name: 'hamburger', keywords: 'burger food' },
      { char: '🍟', name: 'fries', keywords: 'potato food' },
      { char: '🌭', name: 'hotdog', keywords: 'food' },
      { char: '🌮', name: 'taco', keywords: 'food' },
      { char: '🌯', name: 'burrito', keywords: 'food' },
      { char: '🍜', name: 'ramen', keywords: 'noodles soup' },
      { char: '🍣', name: 'sushi', keywords: 'japanese food' },
      { char: '🍩', name: 'doughnut', keywords: 'donut sweet' },
      { char: '🍪', name: 'cookie', keywords: 'sweet snack' },
      { char: '🎂', name: 'birthday', keywords: 'cake party' },
      { char: '🍰', name: 'cake', keywords: 'dessert sweet' },
      { char: '🍫', name: 'chocolate_bar', keywords: 'candy sweet' },
      { char: '🍿', name: 'popcorn', keywords: 'movie snack' },
      { char: '☕', name: 'coffee', keywords: 'drink tea morning' },
      { char: '🧋', name: 'bubble_tea', keywords: 'boba drink' },
      { char: '🥤', name: 'cup_with_straw', keywords: 'soda drink' },
      { char: '🍺', name: 'beer', keywords: 'drink cheers' },
      { char: '🥂', name: 'champagne_glass', keywords: 'cheers toast' },
    ],
  },
];

export const ALL_EMOJIS: EmojiEntry[] = EMOJI_CATEGORIES.flatMap((c) => c.emojis);

const SHORTCODE_ALIASES: Record<string, string> = {
  cry: '😢',
  crying: '😢',
  crying_face: '😢',
  sob: '😭',
  heart: '❤️',
  love: '❤️',
  broken_heart: '💔',
  thumbsup: '👍',
  thumbs_up: '👍',
  '+1': '👍',
  thumbsdown: '👎',
  thumbs_down: '👎',
  '-1': '👎',
  lol: '😂',
  lmao: '🤣',
  laugh: '😂',
  happy: '😀',
  sad: '😔',
  angry: '😠',
  mad: '😡',
  cool: '😎',
  shades: '😎',
  check: '✅',
  checkmark: '✅',
  x: '❌',
  cross: '❌',
  question: '❓',
  exclamation: '❗',
  salute: '🫡',
  think: '🤔',
  nerd: '🤓',
  clown: '🤡',
  dead: '💀',
  dead_skull: '💀',
  sus: '🤨',
  eyebrow: '🤨',
  waving: '👋',
  hi: '👋',
  bye: '👋',
  bro: '🙏',
  please: '🥹',
  pleading: '🥺',
  tea: '☕',
  boba: '🧋',
  donut: '🍩',
  burger: '🍔',
  cat: '🐱',
  dog: '🐶',
  sparkles: '✨',
  lightning: '⚡',
  star_eyes: '🤩',
  mind_blown: '🤯',
  pepe: '🐸',
};

const SHORTCODE_TO_EMOJI = new Map<string, string>();
for (const entry of ALL_EMOJIS) {
  const key = entry.name.toLowerCase();
  if (!SHORTCODE_TO_EMOJI.has(key)) {
    SHORTCODE_TO_EMOJI.set(key, entry.char);
  }
}
for (const [alias, char] of Object.entries(SHORTCODE_ALIASES)) {
  if (!SHORTCODE_TO_EMOJI.has(alias)) {
    SHORTCODE_TO_EMOJI.set(alias, char);
  }
}

export function lookupEmojiByShortcode(nameRaw: string): string | null {
  return SHORTCODE_TO_EMOJI.get(nameRaw.trim().toLowerCase()) ?? null;
}

export function replaceEmojiShortcodeBeforeCursor(
  inputEl: HTMLInputElement | HTMLTextAreaElement,
): boolean {
  const start = inputEl.selectionStart;
  const end = inputEl.selectionEnd;
  if (start === null || end === null || start !== end) {
    return false;
  }

  const before = inputEl.value.slice(0, start);
  const match = /:([a-zA-Z0-9_+-]{1,40}):$/.exec(before);
  if (!match) {
    return false;
  }

  const emoji = lookupEmojiByShortcode(match[1]);
  if (!emoji) {
    return false;
  }

  const matchStart = start - match[0].length;
  const nextVal = inputEl.value.slice(0, matchStart) + emoji + inputEl.value.slice(end);
  inputEl.value = nextVal;
  const nextPos = matchStart + emoji.length;
  inputEl.setSelectionRange(nextPos, nextPos);
  return true;
}

export interface EmojiSuggestion {
  char: string;
  name: string;
}

export function searchEmojiSuggestions(queryRaw: string, limit = 24): EmojiSuggestion[] {
  const q = queryRaw.trim().toLowerCase();
  if (!q) {
    return [];
  }

  const scored: Array<{ entry: EmojiSuggestion; score: number; order: number }> = [];
  const seenChars = new Set<string>();
  let order = 0;

  for (const [alias, char] of Object.entries(SHORTCODE_ALIASES)) {
    const key = alias.toLowerCase();
    let score = -1;
    if (key === q) {
      score = 0;
    } else if (key.startsWith(q)) {
      score = 1;
    } else if (key.includes(q)) {
      score = 2;
    }
    if (score >= 0 && !seenChars.has(`${char}:${key}`)) {
      seenChars.add(`${char}:${key}`);
      scored.push({ entry: { char, name: key }, score, order: order++ });
    }
  }

  for (const item of ALL_EMOJIS) {
    const nameLower = item.name.toLowerCase();
    const keywordsLower = item.keywords.toLowerCase();
    let score = -1;
    if (nameLower === q) {
      score = 0;
    } else if (nameLower.startsWith(q)) {
      score = 1;
    } else if (nameLower.includes(q)) {
      score = 2;
    } else if (keywordsLower.split(/\s+/).some((kw) => kw.startsWith(q))) {
      score = 3;
    } else if (keywordsLower.includes(q)) {
      score = 4;
    }
    if (score >= 0 && !seenChars.has(`${item.char}:${nameLower}`)) {
      seenChars.add(`${item.char}:${nameLower}`);
      scored.push({ entry: { char: item.char, name: item.name }, score, order: order++ });
    }
  }

  scored.sort((a, b) => a.score - b.score || a.entry.name.length - b.entry.name.length || a.order - b.order);

  // Deduplicate repeated emoji characters while keeping best matching shortcode label.
  const result: EmojiSuggestion[] = [];
  const emittedChars = new Set<string>();
  for (const row of scored) {
    if (emittedChars.has(row.entry.char)) {
      continue;
    }
    emittedChars.add(row.entry.char);
    result.push(row.entry);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}
