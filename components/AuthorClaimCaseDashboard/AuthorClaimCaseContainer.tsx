import { AUTHOR_CLAIM_STATUS } from "./constants/AuthorClaimStatus";
import { AuthorClaimCase } from "./api/AuthorClaimCaseGetCases";
import { css, StyleSheet } from "aphrodite";
import { getCases } from "./api/AuthorClaimCaseGetCases";
import { INNER_EL_WIDTH } from "./AuthorClaimCaseDashboard";
import { nullthrows } from "../../config/utils/nullchecks";
import { useRouter, NextRouter } from "next/router";
import AuthorClaimCaseCard from "./AuthorClaimCaseCard";
import React, { useEffect, ReactElement, useState } from "react";

type Props = {
  lastFetchTime: number;
  setLastFetchTime: Function;
};

const useEffectHandleCaseFetch = ({
  currRouter,
  lastFetchTime,
  setClaimCases,
}: {
  currRouter: NextRouter;
  lastFetchTime: number;
  setClaimCases: React.Dispatch<React.SetStateAction<AuthorClaimCase[]>>;
}): void => {
  // @ts-ignore url-status is implicitly set with the constant
  const queriedStatus = AUTHOR_CLAIM_STATUS[currRouter.query.case_status];
  useEffect((): void => {
    getCases({
      caseStatus: queriedStatus,
      onSuccess: setClaimCases,
    });
  }, [lastFetchTime, queriedStatus, setClaimCases]);
};

export default function AuthorClaimCaseContainer({
  lastFetchTime,
  setLastFetchTime,
}: Props): ReactElement<"div"> {
  const router = useRouter();
  const [claimCases, setClaimCases] = useState<Array<AuthorClaimCase>>([]);
  useEffectHandleCaseFetch({
    lastFetchTime,
    currRouter: router,
    setClaimCases,
  });

  const caseCards = claimCases.map(
    (claimCase: AuthorClaimCase): ReactElement<typeof AuthorClaimCaseCard> => {
      const caseID = claimCase.caseData.id || Date.now();
      return (
        <AuthorClaimCaseCard
          authorClaimCase={claimCase}
          cardWidth={INNER_EL_WIDTH}
          key={`author-claim-case-card-${caseID}`}
          setLastFetchTime={setLastFetchTime}
        />
      );
    }
  );

  return (
    <div className={css(styles.authorClaimCaseContainer)}>{caseCards}</div>
  );
}

const styles = StyleSheet.create({
  authorClaimCaseContainer: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    justifyContent: "center",
    paddingTop: 24,
    width: "100%",
  },
});
