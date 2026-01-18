import { useState } from 'react';
import Modal from './Modal';
import Button from './Button';

export default function CreateSessionModal({ isOpen, onClose, onSubmit, user }) {
  const [formData, setFormData] = useState({
    title: '',
    courseId: '',
    startTime: '',
    endTime: '',
    description: '',
    priority: 'medium'
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.title.trim()) {
      setError('Session title is required');
      return;
    }
    if (!formData.courseId) {
      setError('Course ID is required');
      return;
    }
    if (!formData.startTime) {
      setError('Start time is required');
      return;
    }
    if (!formData.endTime) {
      setError('End time is required');
      return;
    }

    // Validate end time is after start time
    if (new Date(formData.endTime) <= new Date(formData.startTime)) {
      setError('End time must be after start time');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        user_id: user.id,
        course_id: Number(formData.courseId),
        title: formData.title,
        start_time: formData.startTime,
        end_time: formData.endTime
      });

      // Reset form
      setFormData({
        title: '',
        courseId: '',
        startTime: '',
        endTime: '',
        description: '',
        priority: 'medium'
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create study session');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      title: '',
      courseId: '',
      startTime: '',
      endTime: '',
      description: '',
      priority: 'medium'
    });
    setError('');
    onClose();
  };

  // Calculate duration
  const calculateDuration = () => {
    if (formData.startTime && formData.endTime) {
      const start = new Date(formData.startTime);
      const end = new Date(formData.endTime);
      const diff = end - start;
      if (diff > 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
      }
    }
    return null;
  };

  const duration = calculateDuration();

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} title="Schedule Study Session">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Session Title */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Session Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder="e.g., React Components Deep Dive"
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            disabled={isSubmitting}
          />
        </div>

        {/* Course ID */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Course ID <span className="text-red-400">*</span>
          </label>
          <input
            type="number"
            name="courseId"
            value={formData.courseId}
            onChange={handleChange}
            placeholder="Enter course ID"
            min="1"
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            disabled={isSubmitting}
          />
          <p className="text-sm text-slate-500 mt-1">
            The ID of the course this session belongs to
          </p>
        </div>

        {/* Time Selection Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Start Time */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Start Time <span className="text-red-400">*</span>
            </label>
            <input
              type="datetime-local"
              name="startTime"
              value={formData.startTime}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              disabled={isSubmitting}
            />
          </div>

          {/* End Time */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              End Time <span className="text-red-400">*</span>
            </label>
            <input
              type="datetime-local"
              name="endTime"
              value={formData.endTime}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Duration Display */}
        {duration && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm text-slate-400">Session Duration</p>
                <p className="text-lg font-semibold text-blue-400">{duration}</p>
              </div>
            </div>
          </div>
        )}

        {/* Description (Optional) */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Notes <span className="text-slate-500">(Optional)</span>
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Add any notes or topics to cover during this session..."
            rows={3}
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
            disabled={isSubmitting}
          />
        </div>

        {/* Priority */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Priority <span className="text-slate-500">(Optional)</span>
          </label>
          <div className="grid grid-cols-3 gap-3">
            {['low', 'medium', 'high'].map((priority) => (
              <button
                key={priority}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, priority }))}
                className={`px-4 py-3 rounded-lg border-2 transition-all capitalize ${
                  formData.priority === priority
                    ? priority === 'high'
                      ? 'border-red-500 bg-red-500/20 text-red-400'
                      : priority === 'medium'
                      ? 'border-yellow-500 bg-yellow-500/20 text-yellow-400'
                      : 'border-green-500 bg-green-500/20 text-green-400'
                    : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
                }`}
                disabled={isSubmitting}
              >
                {priority}
              </button>
            ))}
          </div>
        </div>

        {/* Owner Info */}
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
              {user.name[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{user.name}</p>
              <p className="text-xs text-slate-400">Session Organizer</p>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t border-slate-700">
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Scheduling...
              </span>
            ) : (
              'Schedule Session'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
