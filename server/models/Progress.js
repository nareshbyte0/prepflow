import mongoose from 'mongoose';

const progressSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
  solved: { type: [Number], default: [] },
  notes: { type: Map, of: String, default: {} },
  reviewDue: { type: Map, of: Date, default: {} }
}, { timestamps: true });

export default mongoose.model('Progress', progressSchema);
