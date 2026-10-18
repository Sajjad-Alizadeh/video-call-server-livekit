import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

export const TOKEN_TTL_SECONDS = 600;

// Return explicit JSON-safe fields; SDK protobuf objects include bigint values.
function roomInfo(room) {
  return {
    sid: room.sid,
    name: room.name,
    numParticipants: room.numParticipants,
    maxParticipants: room.maxParticipants,
    emptyTimeout: room.emptyTimeout,
  };
}

export function createLiveKit(config) {
  const rooms = new RoomServiceClient(config.livekitUrl, config.apiKey, config.apiSecret, {
    requestTimeout: 5,
  });

  return {
    async createToken({ room, identity, name, canPublish = true, canSubscribe = true, ttl = TOKEN_TTL_SECONDS }) {
      const token = new AccessToken(config.apiKey, config.apiSecret, {
        identity, name, ttl,
      });
      token.addGrant({
        roomJoin: true,
        room,
        canPublish,
        canSubscribe,
        canPublishData: canPublish,
      });
      return {
        token: await token.toJwt(),
        serverUrl: config.websocketUrl,
        expiresIn: ttl,
      };
    },
    async listRooms() {
      return (await rooms.listRooms()).map(roomInfo);
    },
    async createRoom({ name, maxParticipants = 20, emptyTimeout = 600 }) {
      return roomInfo(await rooms.createRoom({ name, maxParticipants, emptyTimeout }));
    },
  };
}
