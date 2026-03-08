export type EmailLocale = "en" | "de" | "fr";

const verifyEn = {
  subject: "Verify your email – iHostMC",
  bodyIntro: "Please verify your email address by clicking the button below.",
  bodyOutro: "If you did not create an account, you can ignore this email.",
  buttonText: "Verify email",
};
const verifyDe = {
  subject: "E-Mail bestätigen – iHostMC",
  bodyIntro: "Bitte bestätigen Sie Ihre E-Mail-Adresse, indem Sie auf die Schaltfläche unten klicken.",
  bodyOutro: "Wenn Sie kein Konto erstellt haben, können Sie diese E-Mail ignorieren.",
  buttonText: "E-Mail bestätigen",
};
const verifyFr = {
  subject: "Vérifiez votre e-mail – iHostMC",
  bodyIntro: "Veuillez vérifier votre adresse e-mail en cliquant sur le bouton ci-dessous.",
  bodyOutro: "Si vous n'avez pas créé de compte, vous pouvez ignorer cet e-mail.",
  buttonText: "Vérifier l'e-mail",
};

export const verifyEmailStrings: Record<EmailLocale, typeof verifyEn> = {
  en: verifyEn,
  de: verifyDe,
  fr: verifyFr,
};

const resetEn = {
  subject: "Reset your password – iHostMC",
  bodyIntro: "You requested a password reset. Click the button below to set a new password.",
  bodyOutro: "If you did not request this, you can ignore this email.",
  buttonText: "Reset password",
};
const resetDe = {
  subject: "Passwort zurücksetzen – iHostMC",
  bodyIntro: "Sie haben eine Passwortzurücksetzung angefordert. Klicken Sie auf die Schaltfläche unten.",
  bodyOutro: "Wenn Sie dies nicht angefordert haben, können Sie diese E-Mail ignorieren.",
  buttonText: "Passwort zurücksetzen",
};
const resetFr = {
  subject: "Réinitialiser votre mot de passe – iHostMC",
  bodyIntro: "Vous avez demandé une réinitialisation du mot de passe. Cliquez sur le bouton ci-dessous.",
  bodyOutro: "Si vous n'avez pas demandé ceci, vous pouvez ignorer cet e-mail.",
  buttonText: "Réinitialiser le mot de passe",
};

export const resetPasswordStrings: Record<EmailLocale, typeof resetEn> = {
  en: resetEn,
  de: resetDe,
  fr: resetFr,
};

export function normalizeEmailLocale(locale: string | undefined): EmailLocale {
  if (locale === "de" || locale === "fr") return locale;
  return "en";
}
