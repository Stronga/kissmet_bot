export interface SmsProvider {
  sendOtp(to: string, otp: string): Promise<void>;
  sendMessage(to: string, body: string): Promise<{ providerMessageId: string }>;
}

export class MockSmsProvider implements SmsProvider {
  public sent: Array<{ to: string; body: string; otp?: string }> = [];

  async sendOtp(to: string, otp: string): Promise<void> {
    this.sent.push({ to, body: `Your Kissmet verification code is ${otp}`, otp });
    console.log(`[MockSMS] OTP queued for ${maskPhone(to)}`);
  }

  async sendMessage(to: string, body: string): Promise<{ providerMessageId: string }> {
    this.sent.push({ to, body });
    const id = `mock-sms-${this.sent.length}`;
    console.log(`[MockSMS] message ${id} queued for ${maskPhone(to)}`);
    return { providerMessageId: id };
  }

  lastOtp(): string | undefined {
    return [...this.sent].reverse().find((m) => m.otp)?.otp;
  }
}

export class MockEmailProvider {
  public sent: Array<{ to: string; subject: string; body: string }> = [];

  async sendEmail(to: string, subject: string, body: string): Promise<{ providerMessageId: string }> {
    this.sent.push({ to, subject, body });
    const id = `mock-email-${this.sent.length}`;
    console.log(`[MockEmail] message ${id} queued`);
    return { providerMessageId: id };
  }
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `${phone.startsWith("+") ? "+" : ""}${digits.slice(0, 3)}•••••${digits.slice(-4)}`;
}

export const mockSms = new MockSmsProvider();
export const mockEmail = new MockEmailProvider();
