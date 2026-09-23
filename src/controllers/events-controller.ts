import { NextFunction, Request, Response } from 'express';
import { Event, Registration, sequelize } from '../models';
import { presentOldEvent } from '../legacy/event-presenter';
import { ERROR_CODE, ERROR_MESSAGE } from '../constants';

export async function listEvents(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const events = await Event.findAll({
      attributes: {
        include: [
          [
            sequelize.fn(
                'COUNT',
                sequelize.col('registrations.id'),
            ),
            'peopleAlreadyIn',
          ],
        ],
      },
      include: [
        { model: Registration, as: 'registrations', attributes: [] },
      ],
      group: ['Event.id'],
      order: [['title', 'ASC']],
    });

    const result = events.map((event) => {
      const peopleAlreadyIn = Number(event.get('peopleAlreadyIn'));
      return presentOldEvent(event, peopleAlreadyIn);
    });

    res.json({ events: result });
  } catch (error) {
    next(error);
  }
}

export async function getEvent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const eventId = req.params.eventId as string;
    const event = await Event.findByPk(eventId);

    if (!event) {
      res.status(404).json({
        error: {
          code: ERROR_CODE.EVENT_NOT_FOUND,
          message: ERROR_MESSAGE.EVENT_NOT_FOUND,
        },
      });
      return;
    }

    const registeredCount = await Registration.count({
      where: { eventId: event.id },
    });

    // Kept separate from presentOldEvent for historical reasons.
    res.json({
      event: {
        id: event.id,
        title: event.title,
        capacity: event.capacity,
        status: event.status,
        registeredCount,
        freePlaces: Math.max(event.capacity - registeredCount, 0),
        createdAt: event.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
}
