import { NextFunction, Request, Response } from 'express';
import { Event, Registration, sequelize, User } from '../models';
import {
    ERROR_CODE,
    ERROR_MESSAGE,
    MAX_RETRIES_FOR_REGISTRATION,
} from '../constants';
import { Transaction } from 'sequelize';
import { codedError } from '../utils';

function registrationJson(registration: Registration) {
  return {
    id: registration.id,
    eventId: registration.eventId,
    userId: registration.userId,
    createdAt: registration.createdAt,
  };
}

async function attemptRegistration(eventId: string, userId?: string) {
  return await sequelize.transaction(
    {
      isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE,
    },
    async (transaction) => {
      const event = await Event.findByPk(eventId, { transaction });

      if (!event) {
        throw codedError(
          ERROR_MESSAGE.EVENT_NOT_FOUND,
          ERROR_CODE.EVENT_NOT_FOUND,
        );
      }

      const registrationsNow = await Registration.count({
        where: { eventId },
        transaction,
      });

      if (registrationsNow >= event.capacity) {
        throw codedError(
          ERROR_MESSAGE.EVENT_FULL,
          ERROR_CODE.EVENT_FULL,
        );
      }

      const user = await User.findByPk(userId, { transaction });

      if (!user) {
        throw codedError(
          ERROR_MESSAGE.USER_NOT_FOUND,
          ERROR_CODE.USER_NOT_FOUND,
        );
      }

      const [registration, created] = await Registration.findOrCreate({
        where: { eventId, userId: user.id },
        transaction,
      });

      if (!created) {
        return {
          status: 200,
          registration: registrationJson(registration),
        };
      }

      return {
        status: 201,
        registration: registrationJson(registration),
      };
    },
  );
}

export async function registerForEvent(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
      const eventId = req.params.eventId as string;
      const { userId } = req.body as { userId?: string };

      let attempt = 0;
      const maxRetries = MAX_RETRIES_FOR_REGISTRATION;

      while (attempt < maxRetries) {
        try {
          const { status, registration } = await attemptRegistration(
            eventId,
            userId,
          );

          res.status(status).json({ registration });

          return;
        } catch (error: any) {
          if (
            error.name === 'SequelizeDatabaseError' 
            && error.parent?.code === '40001'
          ) {
            attempt++;

            if (attempt >= maxRetries) {
              throw codedError(
                ERROR_MESSAGE.EVENT_FULL,
                ERROR_CODE.EVENT_FULL,
              );
            }

            await new Promise((r) => setTimeout(r, Math.random() * 10 * attempt));

            continue;
          }

          const errorResponse = {
            error: { code: error.code, message: error.message },
          };

          if (error.code === ERROR_CODE.EVENT_FULL) {
            res.status(409).json(errorResponse);
            return;
          }
          if (error.code === ERROR_CODE.EVENT_NOT_FOUND) {
            res.status(404).json(errorResponse);
            return;
          }
          if (error.code === ERROR_CODE.USER_NOT_FOUND) {
            res.status(404).json(errorResponse);
            return;
          }

          throw error;
        }
      }
    } catch (error) {
      next(error);
    }
}
