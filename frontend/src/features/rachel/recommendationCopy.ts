import type { TFunction } from "i18next";
import { clockLabel } from "./JourneyComparison";
import type { JourneySnapshot } from "./contract";
import type { InboxItem } from "./store";

type CopyInput = Pick<JourneySnapshot, "state"> & {
  recommendation: Pick<JourneySnapshot["recommendation"], "recommendedArrival" | "delayMinutesAvoided">;
  journey: Pick<JourneySnapshot["journey"], "arriveBy">;
};

function copy(input: CopyInput, t: TFunction) {
  const values = {
    arrival: clockLabel(input.recommendation.recommendedArrival),
    deadline: clockLabel(input.journey.arriveBy),
    minutes: input.recommendation.delayMinutesAvoided,
  };
  return {
    action: t(`rachel.recommendations.${input.state}.action`, values),
    reason: t(`rachel.recommendations.${input.state}.reason`, values),
  };
}

export const recommendationCopy = (snapshot: JourneySnapshot, t: TFunction) => copy(snapshot, t);

export const inboxActionCopy = (notice: InboxItem, t: TFunction) => copy({
  state: notice.state,
  recommendation: {
    recommendedArrival: notice.recommendedArrival,
    delayMinutesAvoided: notice.delayMinutesAvoided,
  },
  journey: { arriveBy: notice.arriveBy },
}, t).action;

