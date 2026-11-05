// Small fixed lines for family members (no AI call needed).

type Lang = "telugu" | "hindi" | "english" | "tamil" | "kannada" | "malayalam" | "hinglish";

const THANKS: Record<Lang, string> = {
  telugu: "Sare andi, thank you! 🙏 Meeku cheppanu.",
  hindi: "धन्यवाद! 🙏 मैंने बता दिया है।",
  english: "Thank you! 🙏 I've let them know.",
  tamil: "நன்றி! 🙏 அவர்களுக்கு தெரிவித்துவிட்டேன்.",
  kannada: "ಧನ್ಯವಾದಗಳು! 🙏 ಅವರಿಗೆ ತಿಳಿಸಿದ್ದೇನೆ.",
  malayalam: "നന്ദി! 🙏 അവരെ അറിയിച്ചു.",
  hinglish: "Thank you! 🙏 Maine bata diya hai.",
};

const WELCOME: Record<Lang, (owner: string) => string> = {
  telugu: (o) => `Namaskaram andi! 🙏 Nenu Sherr I. ${o} kosam meeku reminders pamputhanu. Reply ivvandi chalu.`,
  hindi: (o) => `नमस्ते! 🙏 मैं Sherr I हूँ। ${o} के लिए आपको रिमाइंडर भेजूँगा। बस जवाब दे दीजिए।`,
  english: (o) => `Hello! 🙏 I'm Sherr I. I'll send you reminders on behalf of ${o}. Just reply when done.`,
  tamil: (o) => `வணக்கம்! 🙏 நான் Sherr I. ${o} சார்பாக நினைவூட்டல்கள் அனுப்புவேன்.`,
  kannada: (o) => `ನಮಸ್ಕಾರ! 🙏 ನಾನು Sherr I. ${o} ಪರವಾಗಿ ನಿಮಗೆ ಜ್ಞಾಪನೆಗಳನ್ನು ಕಳುಹಿಸುತ್ತೇನೆ.`,
  malayalam: (o) => `നമസ്കാരം! 🙏 ഞാൻ Sherr I. ${o} ന് വേണ്ടി ഓർമ്മപ്പെടുത്തലുകൾ അയക്കും.`,
  hinglish: (o) => `Namaste! 🙏 Main Sherr I hoon. ${o} ke liye aapko reminders bhejunga. Bas reply kar dijiye.`,
};

function pick(lang: string): Lang {
  const l = (lang ?? "").toLowerCase().trim() as Lang;
  return l in THANKS ? l : "english";
}

export const thanksLine = (lang: string) => THANKS[pick(lang)];
export const welcomeLine = (lang: string, ownerName: string) => WELCOME[pick(lang)](ownerName);
