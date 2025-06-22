import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MessageController from '../controllers/messageController';
import * as messageService from '../services/messageService';
import * as logger from '../utils/logger';
import { validationResult } from 'express-validator';

vi.mock('../services/messageService');
vi.mock('../utils/logger');
vi.mock('express-validator', () => ({
  validationResult: vi.fn()
}));

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('MessageController', () => {
  let req, res;

  beforeEach(() => {
    req = {};
    res = mockRes();
    vi.clearAllMocks();
  });

  it('test_sendDirectMessage_success', async () => {
    req.user = { id: 'user123' };
    req.body = { recipientId: 'user456', content: 'Hello!', attachments: [] };
    validationResult.mockReturnValue({ isEmpty: () => true });
    messageService.sendDirectMessage.mockResolvedValue({
      success: true,
      message: { _id: 'msg789' }
    });

    await MessageController.sendDirectMessage(req, res);

    expect(messageService.sendDirectMessage).toHaveBeenCalledWith(
      'user123', 'user456', 'Hello!', []
    );
    expect(logger.logMessage).toHaveBeenCalledWith(
      'Direct message sent successfully',
      expect.objectContaining({ senderId: 'user123', recipientId: 'user456', messageId: 'msg789' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: { _id: 'msg789' }
    });
  });

  it('test_getConversations_defaultPagination', async () => {
    req.user = { id: 'user123' };
    req.query = {};
    messageService.getConversations.mockResolvedValue({ conversations: [], page: 1, limit: 20 });

    await MessageController.getConversations(req, res);

    expect(messageService.getConversations).toHaveBeenCalledWith('user123', 1, 20);
    expect(res.json).toHaveBeenCalledWith({ conversations: [], page: 1, limit: 20 });
  });

  it('test_markMessagesAsRead_groupConversation', async () => {
    req.user = { id: 'user123' };
    req.body = { conversationType: 'group', conversationId: 'group789' };
    validationResult.mockReturnValue({ isEmpty: () => true });
    messageService.markGroupConversationAsRead.mockResolvedValue({ success: true, markedCount: 5 });

    await MessageController.markMessagesAsRead(req, res);

    expect(messageService.markGroupConversationAsRead).toHaveBeenCalledWith('user123', 'group789');
    expect(logger.logMessage).toHaveBeenCalledWith(
      'Messages marked as read successfully',
      expect.objectContaining({ userId: 'user123', markedCount: 5 })
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, markedCount: 5 });
  });

  it('test_sendDirectMessage_validationError', async () => {
    req.user = { id: 'user123' };
    req.body = { recipientId: '', content: '', attachments: [] };
    const errorsArr = [{ msg: 'Recipient required' }];
    validationResult.mockReturnValue({
      isEmpty: () => false,
      array: () => errorsArr
    });

    await MessageController.sendDirectMessage(req, res);

    expect(logger.logMessage).toHaveBeenCalledWith(
      'Direct message send failed - validation errors',
      expect.objectContaining({ senderId: 'user123', errors: errorsArr })
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Validation failed',
      errors: errorsArr
    });
    expect(messageService.sendDirectMessage).not.toHaveBeenCalled();
  });

  it('test_getMessages_invalidConversationType', async () => {
    req.user = { id: 'user123' };
    req.params = { type: 'invalid', id: 'conv123' };
    req.query = {};

    await MessageController.getMessages(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid conversation type. Must be "direct" or "group"'
    });
  });

  it('test_deleteMessage_notFound', async () => {
    req.user = { id: 'user123' };
    req.params = { messageId: 'msg404' };
    messageService.deleteMessage.mockResolvedValue({
      success: false,
      message: 'Message not found'
    });

    await MessageController.deleteMessage(req, res);

    expect(messageService.deleteMessage).toHaveBeenCalledWith('msg404', 'user123');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Message not found'
    });
  });

  it('test_addReaction_success', async () => {
    req.user = { id: 'user123' };
    req.params = { messageId: 'msg789' };
    req.body = { emoji: '👍' };
    validationResult.mockReturnValue({ isEmpty: () => true });
    messageService.addReaction.mockResolvedValue({ success: true, reaction: { emoji: '👍' } });

    await MessageController.addReaction(req, res);

    expect(messageService.addReaction).toHaveBeenCalledWith('msg789', 'user123', '👍');
    expect(res.json).toHaveBeenCalledWith({ success: true, reaction: { emoji: '👍' } });
  });

  it('test_searchMessages_queryTooShort', async () => {
    req.user = { id: 'user123' };
    req.query = { query: 'a' };

    await MessageController.searchMessages(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Search query must be at least 2 characters long'
    });
  });
});