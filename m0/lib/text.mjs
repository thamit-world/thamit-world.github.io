// 合成データの文章の素(§5.1)。実在の人名・店名・イベント名は使わない。
// どれも「サンプル」「テスト」を含み、一目で作り物と分かるようにする。

export const genres = [
  { key: 'cafe-bar', label: { ja: 'カフェ・バー・ラウンジ', en: 'Cafe / Bar / Lounge' } },
  { key: 'club-music', label: { ja: 'クラブ・音楽', en: 'Club / Music' } },
  { key: 'gathering', label: { ja: '集会・交流会', en: 'Meetup / Social' } },
  { key: 'study', label: { ja: '作業・勉強会', en: 'Work session / Study' } },
  { key: 'photo-session', label: { ja: '撮影会', en: 'Photo session' } },
  { key: 'other', label: { ja: 'その他', en: 'Other' } },
]

const pageKinds = {
  'cafe-bar': [
    ['サンプル喫茶', 'Sample Cafe'],
    ['テストバー', 'Test Bar'],
    ['サンプルラウンジ', 'Sample Lounge'],
  ],
  'club-music': [
    ['サンプルクラブ', 'Sample Club'],
    ['テスト音楽室', 'Test Music Room'],
  ],
  gathering: [
    ['サンプル集会', 'Sample Meetup'],
    ['テスト交流会', 'Test Social'],
  ],
  study: [
    ['サンプル作業部屋', 'Sample Work Room'],
    ['テスト勉強会', 'Test Study Group'],
  ],
  'photo-session': [['サンプル撮影会', 'Sample Photo Session']],
  other: [['サンプル企画', 'Sample Project']],
}

export const pageNameFor = (genreKey, number) => {
  const kinds = pageKinds[genreKey] ?? pageKinds.other
  const [ja, en] = kinds[number % kinds.length]
  const suffix = String(number).padStart(3, '0')
  return { ja: `${ja} ${suffix}`, en: `${en} ${suffix}` }
}

export const personNameFor = (number) => `サンプル利用者 ${String(number).padStart(3, '0')}`

const eventSuffixes = [
  ['定例会', 'Regular Night'],
  ['営業日', 'Open Night'],
  ['夜の部', 'Night Session'],
  ['週末スペシャル', 'Weekend Special'],
  ['初心者の日', 'Beginners Day'],
  ['試験営業', 'Trial Night'],
  ['ゆるい集まり', 'Casual Gathering'],
  ['音楽の夜', 'Music Night'],
]

// baseName は pageNameFor の { ja, en }
export const eventNameFor = (random, baseName) => {
  const [ja, en] = random.pick(eventSuffixes)
  return { ja: `${baseName.ja} ${ja}`, en: `${baseName.en} ${en}` }
}

const descriptionSentences = [
  ['これは M0 試験用の合成データです。', 'This is synthetic data for the M0 test.'],
  ['落ち着いた雰囲気の部屋でゆっくり話せます。', 'A calm room where you can talk slowly.'],
  ['初めての方も歓迎します。', 'First-timers are welcome.'],
  ['音楽を流しながら雑談をします。', 'We chat while playing music.'],
  ['写真を撮りたい方はスタッフに声をかけてください。', 'Ask the staff if you want to take photos.'],
  ['作業や勉強を黙々と進める会です。', 'A quiet session for work and study.'],
  ['毎回ちがうテーマで集まります。', 'Each time we gather around a different theme.'],
  ['日本語と英語のどちらでも大丈夫です。', 'Both Japanese and English are fine.'],
  ['ドリンクのメニューは架空のものです。', 'The drink menu is fictional.'],
  ['終了時刻はその日の流れで決めます。', 'The end time depends on the night.'],
]

// 目標の文字数(日本語)に届くまで文を足す
export const sentencesUpTo = (random, targetLength, maximumLength) => {
  let ja = ''
  let en = ''
  while (ja.length < targetLength) {
    const [sentenceJa, sentenceEn] = random.pick(descriptionSentences)
    if ((ja + sentenceJa).length > maximumLength) break
    ja += sentenceJa
    en += (en ? ' ' : '') + sentenceEn
  }
  return { ja, en }
}

const joinMethods = [
  ['グループ+から入れます。開始10分前にインスタンスを立てます。', 'Join via Group+. The instance opens 10 minutes before the start.'],
  ['サンプル利用者にフレンド申請のうえ Join してください。', 'Send a friend request to the sample user, then join.'],
  ['フレンド+のインスタンスを立てます。', 'We open a Friends+ instance.'],
  ['グループの告知をご確認ください(試験用の文言です)。', 'Check the group announcement (test wording).'],
]

export const joinMethodFor = (random, targetLength, maximumLength) => {
  const [ja, en] = random.pick(joinMethods)
  let extendedJa = ja
  let extendedEn = en
  while (extendedJa.length < targetLength) {
    const [extraJa, extraEn] = random.pick(joinMethods)
    if ((extendedJa + extraJa).length > maximumLength) break
    extendedJa += extraJa
    extendedEn += ` ${extraEn}`
  }
  return { ja: extendedJa, en: extendedEn }
}

export const tagPool = ['サンプル', '初心者歓迎', '試験用', '雑談', '音楽', '作業', '写真', '英語OK', '静か', '合成データ']

export const roles = {
  host: { ja: '主催', en: 'Host' },
  performer: { ja: '出演', en: 'Performer' },
  dj: { ja: 'DJ', en: 'DJ' },
  cast: { ja: 'キャスト', en: 'Cast' },
  staff: { ja: 'スタッフ', en: 'Staff' },
}
