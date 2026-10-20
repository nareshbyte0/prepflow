import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  leetcodeUsername: { type: String, trim: true, maxlength: 40, default: '' },
  passwordHash: { type: String, required: true },
  tokenVersion: { type: Number, default: 0 },
  emailVerified: { type: Boolean, default: true },
  emailVerifyTokenHash: { type: String, default: '' },
  emailVerifyExpiresAt: { type: Date, default: null },
  passwordResetTokenHash: { type: String, default: '' },
  passwordResetExpiresAt: { type: Date, default: null },
  dailyGoal: { type: Number, min: 1, max: 20, default: 3 },
  leetcodeSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  leetcodeSyncedAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
