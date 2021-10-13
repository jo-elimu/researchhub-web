import API from "~/config/api";
import { AUTH_TOKEN } from "~/config/constants";
import { CKEditor, CKEditorContext } from "@ckeditor/ckeditor5-react";
import {
  Context,
  ELNEditor as CKELNEditor,
  SimpleBalloonEditor,
} from "@thomasvu/ckeditor5-custom-build";
import { Helpers } from "@quantfive/js-web-config";
import { breakpoints } from "~/config/themes/screen";
import { css, StyleSheet } from "aphrodite";
import { useRef, useState, useEffect, useCallback } from "react";
import NoteShareButton from "~/components/Notebook/NoteShareButton";
import { PERMS } from "~/components/Notebook/utils/notePermissions";

const saveData = (editor, noteId) => {
  const noteParams = {
    title: editor.plugins.get("Title").getTitle() || "Untitled",
  };
  fetch(API.NOTE({ noteId }), API.PATCH_CONFIG(noteParams))
    .then(Helpers.checkStatus)
    .then(Helpers.parseJSON);

  const noteContentParams = {
    full_src: editor.getData(),
    plain_text: "",
    note: noteId,
  };

  fetch(API.NOTE_CONTENT(), API.POST_CONFIG(noteContentParams))
    .then(Helpers.checkStatus)
    .then(Helpers.parseJSON);
};

const ELNEditor = ({
  currentNote,
  currentOrganizationId,
  currentOrganization,
  isCollaborativeReady,
  orgSlug,
  setIsCollaborativeReady,
  setTitles,
  titles,
  user,
}) => {
  const sidebarElementRef = useRef();
  const [presenceListElement, setPresenceListElement] = useState(null);
  const [_currentNote, _setCurrentNote] = useState(currentNote);

  const onRefChange = useCallback((node) => {
    if (node !== null) {
      setPresenceListElement(node);
    }
  }, []);

  const channelId = `${orgSlug}-${
    currentOrganizationId > 0 ? currentOrganizationId : user.id
  }-${_currentNote.id}`;

  const handleInput = (editor) => {
    const updatedTitles = {};
    for (const noteId in titles) {
      updatedTitles[noteId] =
        String(noteId) === String(_currentNote.id)
          ? editor.plugins.get("Title").getTitle() || "Untitled"
          : titles[noteId];
    }

    setTitles(updatedTitles);
  };

  useEffect(() => {
    if (_currentNote?.id !== currentNote?.id) {
      _setCurrentNote(currentNote);
    }
  }, [currentNote]);

  return (
    <div className={css(styles.container)}>
      <div className={css(styles.noteHeader)}>
        <div className={css(styles.presenceListContainer)}>
          <div
            ref={onRefChange}
            className={
              css(styles.presenceList, isCollaborativeReady && styles.green) +
              " presence"
            }
          />
        </div>
        <NoteShareButton noteId={_currentNote.id} org={currentOrganization} />
      </div>
      {presenceListElement !== null && (
        <CKEditorContext
          config={{
            // The configuration for real-time collaboration features, shared between the editors:
            cloudServices: {
              tokenUrl: () => {
                return new Promise((resolve, reject) => {
                  const xhr = new XMLHttpRequest();
                  xhr.open("GET", API.CKEDITOR_TOKEN());

                  xhr.addEventListener("load", () => {
                    const statusCode = xhr.status;
                    const xhrResponse = xhr.response;

                    if (statusCode < 200 || statusCode > 299) {
                      return reject(new Error("Cannot download a new token!"));
                    }

                    return resolve(xhrResponse);
                  });

                  xhr.addEventListener("error", () =>
                    reject(new Error("Network error"))
                  );
                  xhr.addEventListener("abort", () =>
                    reject(new Error("Abort"))
                  );
                  xhr.setRequestHeader(
                    "Authorization",
                    "Token " +
                      (typeof window !== "undefined"
                        ? window.localStorage[AUTH_TOKEN]
                        : "")
                  );
                  xhr.send();
                });
              },
              webSocketUrl: "wss://80957.cke-cs.com/ws",
            },
            // Collaboration configuration for the context:
            collaboration: {
              channelId,
            },
            sidebar: {
              container: sidebarElementRef.current,
            },
            presenceList: {
              container: presenceListElement,
              onClick: (user, element) => console.log(user, element),
            },
          }}
          context={Context}
        >
          <div className={css(styles.editor)} key={_currentNote.id}>
            <CKEditor
              config={{
                title: {
                  placeholder: "Untitled",
                },
                placeholder:
                  "Start typing to continue with an empty page, or pick a template",
                initialData: _currentNote.latest_version?.src ?? "",
                simpleUpload: {
                  // The URL that the images are uploaded to.
                  uploadUrl: API.SAVE_IMAGE,

                  // Headers sent along with the XMLHttpRequest to the upload server.
                  headers: {
                    Authorization:
                      "Token " +
                      (typeof window !== "undefined"
                        ? window.localStorage[AUTH_TOKEN]
                        : ""),
                  },
                },
                collaboration: {
                  channelId,
                },
                autosave: {
                  save(editor) {
                    return saveData(editor, _currentNote.id);
                  },
                },
              }}
              editor={CKELNEditor}
              id={_currentNote.id}
              onChange={(event, editor) => handleInput(editor)}
              onReady={(editor) => {
                console.log("Editor is ready to use!", editor);
                setIsCollaborativeReady(true);
              }}
            />
          </div>
        </CKEditorContext>
      )}
      <div ref={sidebarElementRef} className="sidebar"></div>
    </div>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "relative",
    marginLeft: "max(min(16%, 300px), 240px)",
    width: "100%",
    [`@media only screen and (max-width: ${breakpoints.medium.str})`]: {
      marginLeft: 0,
    },
  },
  editorContainer: {},
  editor: {
    height: "100%",
  },
  hideEditor: {
    display: "none",
  },
  noteHeader: {
    display: "flex",
    justifyContent: "flex-end",
    padding: "0px 30px",
  },
  loaderContainer: {
    height: "calc(100vh - 216px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  presenceList: {
    padding: 16,
  },
  hideReadOnlyEditor: {
    display: "none",
  },
});

export default ELNEditor;
