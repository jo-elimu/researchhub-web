import { breakpoints } from "~/config/themes/screen";
import { connect } from "react-redux";
import { css, StyleSheet } from "aphrodite";
import { ID } from "~/config/types/root_types";
import {
  NewPostButtonContext,
  NewPostButtonContextType,
} from "~/components/contexts/NewPostButtonContext";
import { ReactElement, useContext } from "react";
import { ROUTES as WS_ROUTES } from "~/config/ws";
import { WizardBodyTypes } from "./types/PaperUploadWizardTypes";
import PaperUploadWizardHeader from "./PaperUploadWizardHeader";
import PaperUploadWizardStandbyBody from "./PaperUploadWizardStandbyBody";
import PaperUploadWizardUpdatePaper from "./PaperUploadWizardUpdatePaper";
import PaperUploadWizardUrlOrDOIBody from "./PaperUploadWizardUrlOrDOIBody";
import PaperUploadWizardPDFUpload from "./PaperUploadWizardPDFUpload";
import PaperUploadWizardDOIBody from "./PaperUploadWizardDOIBody";

type Props = { user: any; /* redux */ onExit: () => void };
type WizardBodyElement = ReactElement<typeof PaperUploadWizardUrlOrDOIBody>;

function getWizardBody({
  currentUserID,
  currentStep,
  onExit,
}: {
  currentUserID: ID;
  currentStep: WizardBodyTypes;
  onExit: () => void;
}): WizardBodyElement {
  switch (currentStep) {
    case "doi_upload":
      return <PaperUploadWizardDOIBody onExit={onExit} />;
    case "pdf_upload":
      return <PaperUploadWizardPDFUpload onExit={onExit} />;
    case "posted_paper_update":
      return <PaperUploadWizardUpdatePaper onExit={onExit} />;
    case "standby":
      return (
        // @ts-ignore legacy socket hook
        <PaperUploadWizardStandbyBody
          onExit={onExit}
          wsAuth
          wsUrl={WS_ROUTES.PAPER_SUBMISSION(currentUserID)}
        />
      );
    case "url_upload":
    default:
      return <PaperUploadWizardUrlOrDOIBody onExit={onExit} />;
  }
}

function PaperUploadWizardContainer({
  user,
  onExit,
}: Props): ReactElement<Props> {
  const {
    values: { wizardBodyType },
  } = useContext<NewPostButtonContextType>(NewPostButtonContext);
  const wizardBody = getWizardBody({
    currentUserID: user?.id,
    currentStep: wizardBodyType,
    onExit,
  });

  return (
    <div className={css(styles.paperUploadWizardContainer)}>
      <div className={css(styles.contentWrap)}>
        <PaperUploadWizardHeader currentStep={wizardBodyType} />
        <div className={css(styles.bodyWrap)}>{wizardBody}</div>
      </div>
    </div>
  );
}

const mapStateToProps = (state) => ({
  user: state.auth.user,
});

export default connect(mapStateToProps, {})(PaperUploadWizardContainer);

const styles = StyleSheet.create({
  paperUploadWizardContainer: {
    alignItems: "center",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "32px 0",
    width: "100%",
    height: "100%",
    minWidth: "600px",
    [`@media only screen and (max-width: ${breakpoints.small})`]: {
      minWidth: "0",
      padding: "16px 0 0",
    },
  },
  bodyWrap: {},
  contentWrap: {
    maxWidth: 720,
    width: "100%",
  },
});
