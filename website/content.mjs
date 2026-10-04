// Words for the website: what each format is, which conversions get their own page, and the FAQ.

/** Name and one or two sentences per format; landing pages combine these. */
export const FORMAT_INFO = {
  jpg: { name: 'JPG', long: 'JPEG image', about: 'JPG is the most widely supported photo format. It compresses well and opens everywhere, from phones to printers to email.' },
  png: { name: 'PNG', long: 'PNG image', about: 'PNG is lossless and supports transparency, which makes it the usual choice for screenshots, logos and graphics with sharp edges.' },
  webp: { name: 'WEBP', long: 'WebP image', about: 'WebP is Google’s web image format. It is usually 25–35% smaller than JPG at the same quality and supports transparency and animation.' },
  avif: { name: 'AVIF', long: 'AVIF image', about: 'AVIF is the newest web image format. It is often half the size of JPG at similar quality and is supported by all current browsers.' },
  heic: { name: 'HEIC', long: 'HEIC photo', about: 'HEIC is the format iPhones and iPads use for photos. It is compact, but many Windows apps, websites and older devices can’t open it.' },
  gif: { name: 'GIF', long: 'GIF image', about: 'GIF is the classic format for short looping animations. It is limited to 256 colours per frame, so files can get large.' },
  tiff: { name: 'TIFF', long: 'TIFF image', about: 'TIFF is a lossless format used in print, scanning and photo archiving.' },
  bmp: { name: 'BMP', long: 'bitmap image', about: 'BMP is an uncompressed Windows bitmap. Files are large, but almost every program can read them.' },
  ico: { name: 'ICO', long: 'Windows icon', about: 'ICO holds a Windows or website icon at several sizes in one file. nxtconvert writes 16 to 256 pixel versions.' },
  svg: { name: 'SVG', long: 'SVG vector graphic', about: 'SVG is a vector format that scales to any size. Converting it gives you a regular image at a fixed size.' },
  pdf: { name: 'PDF', long: 'PDF document', about: 'PDF keeps layout identical on every device, which makes it the standard for sharing, printing and signing documents.' },
  mp4: { name: 'MP4', long: 'MP4 video', about: 'MP4 with H.264 video plays on virtually every phone, browser, TV and editor.' },
  mov: { name: 'MOV', long: 'QuickTime video', about: 'MOV is Apple’s QuickTime format, used by iPhones and Macs. Outside the Apple world it is often less convenient than MP4.' },
  webm: { name: 'WEBM', long: 'WebM video', about: 'WebM uses the open VP9 and Opus codecs and is made for playback in web browsers.' },
  mkv: { name: 'MKV', long: 'Matroska video', about: 'MKV is a flexible container that can hold many audio and subtitle tracks. Some players and editors don’t accept it.' },
  avi: { name: 'AVI', long: 'AVI video', about: 'AVI is an older Windows video format, still needed by some legacy players and hardware.' },
  m4v: { name: 'M4V', long: 'M4V video', about: 'M4V is Apple’s variant of MP4, used by iTunes and the TV app.' },
  mp3: { name: 'MP3', long: 'MP3 audio', about: 'MP3 is the most compatible audio format there is. Every device and car stereo plays it.' },
  wav: { name: 'WAV', long: 'WAV audio', about: 'WAV is uncompressed audio. It is ideal for editing, but a few minutes can take tens of megabytes.' },
  flac: { name: 'FLAC', long: 'FLAC audio', about: 'FLAC is lossless audio at about half the size of WAV, popular for music libraries.' },
  aac: { name: 'AAC', long: 'AAC audio', about: 'AAC sounds better than MP3 at the same bitrate and is the standard audio codec on Apple devices and YouTube.' },
  m4a: { name: 'M4A', long: 'M4A audio', about: 'M4A is AAC audio in an MP4 container, the format of iTunes purchases and iPhone voice memos.' },
  ogg: { name: 'OGG', long: 'Ogg Vorbis audio', about: 'OGG Vorbis is an open audio format used by games, Spotify and Linux software.' },
  opus: { name: 'OPUS', long: 'Opus audio', about: 'Opus is a modern open codec that is excellent for speech and music at low bitrates. WhatsApp voice notes use it.' },
  docx: { name: 'DOCX', long: 'Word document', about: 'DOCX is the Microsoft Word format, the most common way to share editable documents.' },
  doc: { name: 'DOC', long: 'Word 97–2003 document', about: 'DOC is the older binary Word format.' },
  odt: { name: 'ODT', long: 'OpenDocument text', about: 'ODT is the open document format used by LibreOffice and Google Docs exports.' },
  rtf: { name: 'RTF', long: 'Rich Text document', about: 'RTF is a simple formatted-text format that nearly every word processor can open.' },
  txt: { name: 'TXT', long: 'plain text file', about: 'TXT is plain text with no formatting, readable by anything.' },
  html: { name: 'HTML', long: 'web page', about: 'HTML is the language of web pages, which makes it easy to publish or reuse document content online.' },
  md: { name: 'Markdown', long: 'Markdown file', about: 'Markdown is plain text with light formatting, used in READMEs, notes apps and documentation.' },
  epub: { name: 'EPUB', long: 'e-book', about: 'EPUB is the standard e-book format for Apple Books, Kobo and most e-readers.' }
}

/**
 * Conversions that get their own landing page: the pairs people search for most.
 * Every one must work with nothing but the app installed (the build checks this).
 * `blurb` replaces the generic opening line where there's something specific to say.
 */
export const PAIRS = [
  { from: 'heic', to: 'jpg', blurb: 'iPhone photos are saved as HEIC, which many Windows PCs, websites and older devices can’t open. Converting to JPG makes them work everywhere and keeps the quality.' },
  { from: 'heic', to: 'png' },
  { from: 'webp', to: 'jpg', blurb: 'Images saved from websites are often WebP, which some editors and upload forms reject. Turn them into ordinary JPGs in a second.' },
  { from: 'webp', to: 'png' },
  { from: 'png', to: 'jpg', blurb: 'PNG screenshots and exports can be several times larger than they need to be. Converting to JPG shrinks photos and screenshots for email and the web.' },
  { from: 'jpg', to: 'png' },
  { from: 'jpg', to: 'webp' },
  { from: 'png', to: 'webp' },
  { from: 'jpg', to: 'avif' },
  { from: 'png', to: 'avif' },
  { from: 'avif', to: 'jpg' },
  { from: 'jpg', to: 'pdf' },
  { from: 'png', to: 'pdf' },
  { from: 'png', to: 'ico', blurb: 'Make a Windows app icon or website favicon from any PNG. The ICO file holds 16, 32, 48 and up to 256 pixel versions.' },
  { from: 'svg', to: 'png' },
  { from: 'tiff', to: 'jpg' },
  { from: 'bmp', to: 'png' },
  { from: 'gif', to: 'webp' },
  { from: 'mov', to: 'mp4', blurb: 'iPhone and Mac screen recordings are MOV files. MP4 plays on Windows, Android, every browser and every editor, and is often smaller.' },
  { from: 'mp4', to: 'gif', blurb: 'Turn a short clip into a looping GIF for chats, docs and READMEs. nxtconvert picks a palette per clip and caps the size so the GIF stays shareable.' },
  { from: 'mov', to: 'gif' },
  { from: 'mp4', to: 'mp3', blurb: 'Pull the soundtrack out of a video, whether it’s a lecture, a podcast recording or a music video, as an MP3 that plays anywhere.' },
  { from: 'mkv', to: 'mp4' },
  { from: 'avi', to: 'mp4' },
  { from: 'webm', to: 'mp4' },
  { from: 'mp4', to: 'webm' },
  { from: 'wav', to: 'mp3', blurb: 'WAV recordings are huge. MP3 at 192 kbit/s is around a seventh of the size and sounds the same to most ears.' },
  { from: 'flac', to: 'mp3' },
  { from: 'm4a', to: 'mp3' },
  { from: 'ogg', to: 'mp3' },
  { from: 'opus', to: 'mp3' },
  { from: 'aac', to: 'mp3' },
  { from: 'mp3', to: 'wav' },
  { from: 'docx', to: 'pdf', blurb: 'Send a Word document as a PDF so it looks the same for everyone, without opening Word or uploading it to an online converter.' },
  { from: 'docx', to: 'html' },
  { from: 'docx', to: 'txt' },
  { from: 'md', to: 'pdf' },
  { from: 'md', to: 'html' },
  { from: 'html', to: 'pdf' },
  { from: 'txt', to: 'pdf' }
]

/** What each category's settings do, for the landing pages. */
export const SETTINGS_NOTE = {
  image: 'In Settings you can choose the image quality (Maximum to Smallest) and whether to keep or strip metadata such as camera details and location.',
  video: 'In Settings you can cap the resolution (4K down to 480p) and choose High, Balanced or Small file quality.',
  audio: 'In Settings you can pick the bitrate, from 128 to 320 kbit/s, and whether to keep tags such as artist and album.',
  doc: 'Documents keep their headings, lists, tables and images where the target format supports them.'
}

export const FAQ = [
  {
    q: 'Is nxtconvert free?',
    a: 'Yes. nxtconvert is free to download and use, with no ads, no account and no limits on file size or the number of files.'
  },
  {
    q: 'Are my files uploaded anywhere?',
    a: 'No. Every conversion runs on your own computer, and nxtconvert works without an internet connection. The only time it goes online is to check whether a new version is available.'
  },
  {
    q: 'What makes it a lightweight converter?',
    a: 'It is one small window with a drop zone and a queue. There are no accounts, background services, browser extensions or bundled extras. It starts quickly and gets out of your way. The download is bigger than a tiny utility because it includes its own image and video engines (libvips and FFmpeg), so you don’t have to install anything else.'
  },
  {
    q: 'Which formats does it support?',
    a: 'Images: JPG, PNG, WEBP, AVIF, HEIC, GIF, TIFF, BMP, ICO and SVG. Video: MP4, MOV, WEBM, MKV and AVI, plus GIF and MP3 export. Audio: MP3, WAV, FLAC, AAC, M4A, OGG and OPUS. Documents: PDF, DOCX, HTML, TXT and Markdown, with ODT, RTF and EPUB when LibreOffice or Pandoc is installed.'
  },
  {
    q: 'Which systems does it run on?',
    a: 'macOS 12 or later on Apple silicon, Windows 10 and 11 (64-bit), and 64-bit Linux as an AppImage or a .deb package.'
  },
  {
    q: 'Can I convert many files at once?',
    a: 'Yes. Drop in as many files as you like, of any mix of types, and pick a format for each one or set them all at once. nxtconvert works through the queue two files at a time.'
  },
  {
    q: 'How do updates work?',
    a: 'When nxtconvert opens and you are online, it checks for a new version. If there is one, it shows you what changed and asks before downloading anything.'
  },
  {
    q: 'Does it overwrite my original files?',
    a: 'Never. Converted files go to a folder you choose, and if a file with the same name is already there, the new one gets a number added. You can have the originals moved to the Trash after converting, but that is off by default.'
  }
]
