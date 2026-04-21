import { ProfileLegendController } from './lib/app-controller';
import { useProfileLegendController } from './lib/use-profile-legend-controller';

type StageProps = {
  app: ProfileLegendController;
  act: (fn: () => void) => void;
  run: (fn: () => Promise<void>) => Promise<void>;
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function CanonStage({ app, act, run }: StageProps) {
  return (
    <>
      <section className="step-toolbar">
        <button
          type="button"
          className="check-button"
          disabled={!app.canCheckCanonConsistency()}
          onClick={() => {
            void run(() => app.checkCanonConsistency());
          }}
        >
          Check
        </button>
      </section>

      <div className="step-one-grid">
        <section className="stage-card general-card">
          <div className="stage-card-head">
            <h2>General info</h2>
          </div>

          {app.personParseError ? <p className="card-inline-error">{app.personParseError}</p> : null}

          <div className="general-form">
            {app.generalInfoFields.map((field) => (
              <label key={field.key} className="general-row">
                <span className="general-label">{field.label}</span>
                <div className="general-input-wrap">
                  <input
                    type={field.type || 'text'}
                    value={app.getGeneralInfoValue(field)}
                    onChange={(event) => {
                      act(() => app.updateGeneralInfoField(field, event.target.value));
                    }}
                    placeholder={field.placeholder || ''}
                  />

                  {field.suffix ? <small>{field.suffix}</small> : null}
                </div>
              </label>
            ))}
          </div>

          <div className="children-block">
            <div className="children-head">
              <span>Children</span>
              <button
                type="button"
                className="inline-button"
                onClick={() => {
                  act(() => app.addChild());
                }}
              >
                + Add
              </button>
            </div>

            {app.editableChildren.length > 0 ? (
              <div className="child-list">
                {app.editableChildren.map((child, index) => (
                  <div key={`${child.name}-${child.birth_date}-${index}`} className="child-row">
                    <input
                      type="text"
                      value={child.name}
                      onChange={(event) => {
                        act(() => app.updateChildField(index, 'name', event.target.value));
                      }}
                      placeholder="Name"
                    />
                    <input
                      type="date"
                      value={child.birth_date}
                      onChange={(event) => {
                        act(() => app.updateChildField(index, 'birth_date', event.target.value));
                      }}
                    />
                    <button
                      type="button"
                      className="remove-child"
                      onClick={() => {
                        act(() => app.removeChild(index));
                      }}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-inline">No children added yet.</p>
            )}
          </div>
        </section>

        <section className="stage-card characteristics-card">
          <div className="stage-card-head">
            <h2>Characteristics</h2>
          </div>

          <div className="character-columns">
            {app.characteristicColumns.map((column, columnIndex) => (
              <div key={columnIndex} className="character-column">
                {column.map((criterion) => (
                  <div key={criterion.key} className="metric-row">
                    <span className="metric-label">{app.getCriterionDisplayLabel(criterion)}</span>
                    <div className="metric-control">
                      <button
                        type="button"
                        onClick={() => {
                          act(() => app.adjustProfileValue(criterion.key, -1));
                        }}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        step={1}
                        value={String(app.profile[criterion.key] ?? 5)}
                        onChange={(event) => {
                          act(() => {
                            app.profile[criterion.key] = Number(event.target.value || 0);
                            app.onProfileInputChange();
                          });
                        }}
                        onBlur={() => {
                          act(() => app.normalizeProfileValue(criterion.key));
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          act(() => app.adjustProfileValue(criterion.key, 1));
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="stage-card additional-card">
          <div className="stage-card-head">
            <h2>Additional info</h2>
          </div>

          <textarea
            className="additional-textarea"
            value={app.additionalContext}
            onChange={(event) => {
              act(() => {
                app.additionalContext = event.target.value;
                app.onAdditionalContextChange();
              });
            }}
            rows={14}
            placeholder="Add any extra free-form context that should be merged into description."
          />
        </section>
      </div>

      <div className="feedback-grid">
        <article className="feedback-panel">
          <h3>Check results</h3>

          {app.showCanonConsistencyCard && app.canonConsistencyReport ? (
            <>
              {app.canonConsistencyReport.summary ? <p>{app.canonConsistencyReport.summary}</p> : null}

              {(app.canonConsistencyReport.issues || []).length > 0 ? (
                <ul className="feedback-list">
                  {(app.canonConsistencyReport.issues || []).map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : (
                <p>No contradictions found yet.</p>
              )}
            </>
          ) : (
            <p>Canon vs scales check will appear here after you press `Check`.</p>
          )}
        </article>

        <article className="feedback-panel">
          <h3>Status</h3>

          {app.errorMessage ? (
            <p>{app.errorMessage}</p>
          ) : app.noticeMessage ? (
            <p>{app.noticeMessage}</p>
          ) : app.seedInputsDirty ? (
            <p>Source data changed locally. Press `Update` to rebuild canon.</p>
          ) : (
            <p>Canon is in sync. You can run the optional check or continue to anchors.</p>
          )}
        </article>
      </div>

    </>
  );
}

function AnchorsStage({ app, act, run }: StageProps) {
  return (
    <section className="stage-card single-panel">
      <div className="anchors-toolbar">
        <div className="panel-head-side anchors-meta-actions">
          <button
            type="button"
            className="outline-button"
            aria-label="Translate anchors"
            disabled={!app.canTranslateAnchors}
            onClick={() => {
              void run(() => app.translateAnchors());
            }}
          >
            Translate
          </button>
          <span className={cn('count-chip', !app.hasValidAnchorCount && 'invalid')}>{`${app.anchorCount} anchors | required 8-12`}</span>
        </div>
      </div>

      {app.errorMessage ? <div className="stage-message error">{app.errorMessage}</div> : null}

      {app.anchors.length > 0 ? (
        <div className="timeline-list">
          {app.anchors.map((anchor, anchorIndex) => {
            const translatedAnchor = app.getTranslatedAnchor(anchor, anchorIndex);

            return (
              <article key={anchor.id || anchor.event || anchorIndex} className="timeline-card">
                <div className="timeline-card-head">
                  <div>
                    <p className="timeline-meta">{app.formatAnchorMeta(anchor)}</p>
                    <h3>{anchor.event}</h3>
                  </div>
                  <div className="card-actions-grid">
                    <button
                      type="button"
                      className="outline-button small danger-button"
                      disabled={app.isBusy}
                      onClick={() => {
                        act(() => app.deleteAnchor(anchorIndex));
                      }}
                    >
                      Delete anchor
                    </button>
                    <button
                      type="button"
                      className="outline-button small"
                      disabled={app.isBusy}
                      onClick={() => {
                        act(() => app.toggleAnchorRegeneration(anchorIndex));
                      }}
                    >
                      {app.anchorRegenerationIndex === anchorIndex ? 'Hide comment' : 'Regenerate'}
                    </button>
                  </div>
                </div>

                {anchor.worldview_shift ? (
                  <p>
                    <strong>Shift:</strong> {anchor.worldview_shift}
                  </p>
                ) : null}
                {anchor.outcome ? (
                  <p>
                    <strong>Outcome:</strong> {anchor.outcome}
                  </p>
                ) : null}

                {translatedAnchor ? (
                  <div className="translated-block">
                    <div className="translated-block-head">
                      <h4>Russian translation</h4>
                    </div>
                    <p className="timeline-meta">{app.formatAnchorMeta(translatedAnchor)}</p>
                    {translatedAnchor.event ? (
                      <p>
                        <strong>Event:</strong> {translatedAnchor.event}
                      </p>
                    ) : null}
                    {translatedAnchor.worldview_shift ? (
                      <p>
                        <strong>Shift:</strong> {translatedAnchor.worldview_shift}
                      </p>
                    ) : null}
                    {translatedAnchor.outcome ? (
                      <p>
                        <strong>Outcome:</strong> {translatedAnchor.outcome}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {app.anchorRegenerationIndex === anchorIndex ? (
                  <div className="anchor-regenerate-box">
                    <label className="anchor-regenerate-field">
                      <span>What should be fixed</span>
                      <textarea
                        value={app.anchorRegenerationComment}
                        onChange={(event) => {
                          act(() => {
                            app.anchorRegenerationComment = event.target.value;
                          });
                        }}
                        className="anchor-comment-textarea"
                        rows={4}
                        placeholder="Explain what exactly should change in this anchor"
                      />
                    </label>
                    <div className="anchor-regenerate-actions">
                      <button
                        type="button"
                        className="outline-button"
                        disabled={app.isBusy}
                        onClick={() => {
                          act(() => app.cancelAnchorRegeneration());
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="panel-button"
                        disabled={app.isBusy}
                        onClick={() => {
                          void run(() => app.regenerateAnchor(anchorIndex));
                        }}
                      >
                        Apply regeneration
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-block">Anchors will appear here after the second step runs.</div>
      )}

      <div className="anchor-footer-actions">
        <button
          type="button"
          className="outline-button"
          disabled={!app.canGenerateAdditionalAnchor}
          onClick={() => {
            void run(() => app.generateSingleAnchor());
          }}
        >
          Add anchor
        </button>
      </div>
    </section>
  );
}

function FactBankStage({ app, act, run }: StageProps) {
  return (
    <section className="stage-card single-panel">
      <div className="panel-actions facts-head">
        <div>
          <h2>Fact bank</h2>
          <p className="panel-copy">Generate and review the fact bank before moving to legend blocks.</p>
        </div>
        <div className="panel-head-side">
          <button
            type="button"
            className="outline-button"
            aria-label="Translate facts"
            disabled={!app.canTranslateFacts}
            onClick={() => {
              void run(() => app.translateFacts());
            }}
          >
            Translate
          </button>
          <span className={cn('count-chip', !app.hasValidFactCount && 'invalid')}>{`${app.factCount} facts | required 150-220`}</span>
        </div>
      </div>

      <div className="stats-strip">
        <article>
          <span>Anchors</span>
          <strong>{app.anchors.length}</strong>
        </article>
        <article>
          <span>Facts</span>
          <strong>{app.factBank.length}</strong>
        </article>
        <article>
          <span>Hooks</span>
          <strong>{app.hookFactsCount}</strong>
        </article>
      </div>

      {app.factBank.length > 0 ? (
        <div className="fact-bank-list">
          {app.sortedFactBank.map((fact, factIndex) => {
            const translatedFact = app.getTranslatedFact(fact, factIndex);

            return (
              <article key={fact.id || fact.text || factIndex} className="fact-bank-card">
                <div className="timeline-card-head">
                  <p className="timeline-meta">{app.formatFactMeta(fact)}</p>
                  <div className="card-actions-grid">
                    <button
                      type="button"
                      className="outline-button small danger-button"
                      disabled={app.isBusy}
                      onClick={() => {
                        act(() => app.deleteFact(factIndex));
                      }}
                    >
                      Delete fact
                    </button>
                    <button
                      type="button"
                      className="outline-button small"
                      disabled={app.isBusy}
                      onClick={() => {
                        act(() => app.toggleFactRegeneration(factIndex));
                      }}
                    >
                      {app.factRegenerationIndex === factIndex ? 'Hide comment' : 'Regenerate'}
                    </button>
                  </div>
                </div>
                <p>{fact.text}</p>

                {translatedFact ? (
                  <div className="translated-block">
                    <div className="translated-block-head">
                      <h4>Russian translation</h4>
                    </div>
                    <p className="timeline-meta">{app.formatFactMeta(translatedFact)}</p>
                    <p>{translatedFact.text}</p>
                  </div>
                ) : null}

                {app.factRegenerationIndex === factIndex ? (
                  <div className="anchor-regenerate-box">
                    <label className="anchor-regenerate-field">
                      <span>What should be fixed</span>
                      <textarea
                        value={app.factRegenerationComment}
                        onChange={(event) => {
                          act(() => {
                            app.factRegenerationComment = event.target.value;
                          });
                        }}
                        className="anchor-comment-textarea"
                        rows={4}
                        placeholder="Explain what exactly should change in this fact"
                      />
                    </label>
                    <div className="anchor-regenerate-actions">
                      <button
                        type="button"
                        className="outline-button"
                        disabled={app.isBusy}
                        onClick={() => {
                          act(() => app.cancelFactRegeneration());
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="panel-button"
                        disabled={app.isBusy}
                        onClick={() => {
                          void run(() => app.regenerateFact(factIndex));
                        }}
                      >
                        Apply regeneration
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-block">Fact bank entries will appear here after the third step runs.</div>
      )}

      <div className="anchor-footer-actions">
        <button
          type="button"
          className="outline-button"
          disabled={!app.canGenerateAdditionalFact}
          onClick={() => {
            void run(() => app.generateSingleFact());
          }}
        >
          Add fact
        </button>
      </div>
    </section>
  );
}

function BlocksStage({ app, act, run }: StageProps) {
  return (
    <section className="stage-card single-panel">
      <div className="panel-actions">
        <div>
          <h2>Legend output</h2>
          <p className="panel-copy">Generate the full text, publication copy, and block navigator.</p>
        </div>
        <div className="toolbar-button-grid narrative-toolbar-grid">
          <button
            type="button"
            className="panel-button"
            disabled={!app.canRunStage('stage_3_blocks')}
            onClick={() => {
              void run(() => app.runNarrative());
            }}
          >
            Regenerate legend
          </button>
          <button
            type="button"
            className="outline-button"
            aria-label="Translate legend blocks"
            disabled={!app.canTranslateLegendBlocks}
            onClick={() => {
              void run(() => app.translateAllLegendBlocks());
            }}
          >
            Translate
          </button>
          <button
            type="button"
            className="outline-button"
            aria-label="Translate full legend text"
            disabled={!app.canTranslateLegendFullText}
            onClick={() => {
              void run(() => app.translateLegendFullText());
            }}
          >
            Translate
          </button>
          <button
            type="button"
            className="outline-button"
            aria-label="Translate dating texts"
            disabled={!app.canTranslateDatingSiteTexts}
            onClick={() => {
              void run(() => app.translateDatingSiteTexts());
            }}
          >
            Translate
          </button>
        </div>
      </div>

      {app.hasDatingSiteTexts ? (
        <div className="snapshot-grid">
          {app.datingSiteTexts.profile_description ? (
            <article className="snapshot-card">
              <span>Profile description</span>
              <strong>{app.datingSiteTexts.profile_description}</strong>
              {app.translatedDatingSiteTexts.profile_description ? (
                <div className="translated-block compact">
                  <div className="translated-block-head">
                    <h4>Russian translation</h4>
                  </div>
                  <p>{app.translatedDatingSiteTexts.profile_description}</p>
                </div>
              ) : null}
            </article>
          ) : null}

          {app.datingSiteTexts.looking_for_partner ? (
            <article className="snapshot-card">
              <span>Looking for partner</span>
              <strong>{app.datingSiteTexts.looking_for_partner}</strong>
              {app.translatedDatingSiteTexts.looking_for_partner ? (
                <div className="translated-block compact">
                  <div className="translated-block-head">
                    <h4>Russian translation</h4>
                  </div>
                  <p>{app.translatedDatingSiteTexts.looking_for_partner}</p>
                </div>
              ) : null}
            </article>
          ) : null}
        </div>
      ) : null}

      {app.legendFullText ? (
        <article className="story-card">
          <div className="story-card-head">
            <h3>Legend full text</h3>
            <span>{app.getTextLength(app.legendFullText)} chars</span>
          </div>
          <div className="story-body">{app.legendFullText}</div>
          {app.translatedLegendFullText ? (
            <div className="translated-block">
              <div className="translated-block-head">
                <h4>Russian translation</h4>
              </div>
              <div className="story-body">{app.translatedLegendFullText}</div>
            </div>
          ) : null}
        </article>
      ) : (
        <div className="empty-block">The full legend text will appear here after step 4 runs.</div>
      )}

      {app.legendBlocks.length > 0 ? (
        <>
          <div className="block-tabs">
            {app.legendBlocks.map((block) => (
              <button
                key={block.key}
                type="button"
                className={cn('block-tab', app.activeBlock?.key === block.key && 'active')}
                onClick={() => {
                  act(() => app.selectBlock(block.key));
                }}
              >
                <span>{block.label}</span>
                <small>{block.factsUsed || app.getBlockRelatedFactsCount(block.key)}</small>
              </button>
            ))}
          </div>

          {app.activeBlock ? (
            <article className="focused-block">
              <div className="focused-block-head">
                <div>
                  <h3>{app.activeBlock.label}</h3>
                  <p>{`${app.activeBlock.key} | facts=${app.activeBlock.factsUsed} | hooks=${app.activeBlock.hooksUsed}`}</p>
                </div>
              </div>

              <div className="rich-block" dangerouslySetInnerHTML={{ __html: app.formatRichBlockText(app.activeBlock.text) }} />

              {app.translatedActiveBlockText ? (
                <div className="translated-block">
                  <div className="translated-block-head">
                    <h4>Russian translation</h4>
                  </div>
                  <div className="rich-block" dangerouslySetInnerHTML={{ __html: app.formatRichBlockText(app.translatedActiveBlockText) }} />
                </div>
              ) : null}
            </article>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function QcStage({ app, act, run }: StageProps) {
  return (
    <section className="stage-card single-panel">
      <div className="panel-actions">
        <div>
          <h2>QC results</h2>
          <p className="panel-copy">Run the final quality control and review the checks below.</p>
        </div>
        <div className="qc-actions">
          <button
            type="button"
            className="outline-button"
            disabled={app.factBank.length === 0 && app.anchors.length === 0}
            onClick={() => {
              act(() => app.toggleFactsPanel());
            }}
          >
            {app.showFactsPanel ? 'Hide facts' : 'Show facts'}
          </button>
          <button
            type="button"
            className="panel-button"
            disabled={!app.canRunStage('stage_4_qc')}
            onClick={() => {
              void run(() => app.runQc());
            }}
          >
            Run QC
          </button>
        </div>
      </div>

      {app.qcChecks.length > 0 ? (
        <div className="qc-grid">
          {app.qcChecks.map((check) => (
            <article key={check.key} className={cn('qc-card', check.passed && 'ok', !check.passed && 'fail')}>
              <h3>{check.title}</h3>
              <p>{check.passed ? 'OK' : 'Issues found'}</p>
              {check.issues.length > 0 ? (
                <ul>
                  {check.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-block">QC output will appear here after the fifth step runs.</div>
      )}

      {app.showFactsPanel && (app.anchors.length > 0 || app.factBank.length > 0) ? (
        <div className="facts-grid">
          {app.anchors.length > 0 ? (
            <section className="facts-column">
              <h3>Anchors</h3>
              <div className="fact-bank-list compact">
                {app.anchors.map((anchor, index) => (
                  <article key={anchor.id || anchor.event || index} className="fact-bank-card">
                    <p className="timeline-meta">{app.formatAnchorMeta(anchor)}</p>
                    <p>{anchor.event}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {app.factBank.length > 0 ? (
            <section className="facts-column wide">
              <h3>Facts</h3>
              <div className="fact-bank-list compact">
                {app.sortedFactBank.map((fact, index) => (
                  <article key={fact.id || fact.text || index} className="fact-bank-card">
                    <p className="timeline-meta">{app.formatFactMeta(fact)}</p>
                    <p>{fact.text}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function App() {
  const { controller: app, act, run } = useProfileLegendController();

  return (
    <main className="lady-shell">
      <header className="topbar">
        <button type="button" className="topbar-icon" aria-label="Menu">
          <span></span>
          <span></span>
          <span></span>
        </button>

        <div className="topbar-title">Lady card</div>

        <div className="topbar-spacer" aria-hidden="true"></div>
      </header>

      <section className="workspace-shell">
        <aside className="stage-rail">
          <div className="rail-label">Generation steps</div>

          {app.stageDefinitions.map((stage) => {
            const visualState = app.getStageVisualState(stage.key);

            return (
              <button
                key={stage.key}
                type="button"
                className={cn(
                  'stage-tab',
                  visualState === 'ready' && 'state-ready',
                  visualState === 'review' && 'state-review',
                  visualState === 'done' && 'state-done',
                  visualState === 'loading' && 'state-loading',
                  visualState === 'locked' && 'state-locked'
                )}
                disabled={visualState === 'locked' || app.isBusy}
                onClick={() => {
                  void run(() => app.handleStageTabClick(stage.key));
                }}
              >
                <span>{stage.navLabel}</span>
              </button>
            );
          })}
        </aside>

        <section className="stage-screen">
          <div className="screen-head">
            <div>
              <a
                className="screen-back"
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  act(() => app.openStage(app.currentStageKey));
                }}
              >
                Return
              </a>
              <h1>{app.activeStageDefinition.title}</h1>
              <p className="screen-copy">{app.activeStageDefinition.description}</p>
            </div>

            {app.selectedStageView === 'stage_1_anchors' ? (
              <div className="screen-head-actions">
                <button
                  type="button"
                  className="panel-button"
                  disabled={!app.canRunStage('stage_1_anchors')}
                  onClick={() => {
                    void run(() => app.runAnchors());
                  }}
                >
                  Regenerate anchors
                </button>
              </div>
            ) : null}

            {app.selectedStageView === 'stage_2_fact_bank' ? (
              <div className="screen-head-actions">
                <button
                  type="button"
                  className="panel-button"
                  disabled={!app.canRunStage('stage_2_fact_bank')}
                  onClick={() => {
                    void run(() => app.runFacts());
                  }}
                >
                  Regenerate facts
                </button>
              </div>
            ) : null}
          </div>

          {app.selectedStageView === 'stage_0_canon' ? <CanonStage app={app} act={act} run={run} /> : null}
          {app.selectedStageView === 'stage_1_anchors' ? <AnchorsStage app={app} act={act} run={run} /> : null}
          {app.selectedStageView === 'stage_2_fact_bank' ? <FactBankStage app={app} act={act} run={run} /> : null}
          {app.selectedStageView === 'stage_3_blocks' ? <BlocksStage app={app} act={act} run={run} /> : null}
          {app.selectedStageView === 'stage_4_qc' ? <QcStage app={app} act={act} run={run} /> : null}
        </section>
      </section>
    </main>
  );
}

export default App;
