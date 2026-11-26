"""Evaluador de precisión RNF-07 con matriz de confusión por escenario (`day` y `night_rain`).

Valida el pipeline real de `/cv-service`:
`FramePreprocessor` (si hay imagen) -> `YoloVehicleDetector` -> `PolygonIoUEvaluator` -> `SlotTemporalStateMachine`
y verifica los umbrales del ERS:
- Luz diurna (`day`): accuracy >= 95.0%
- Noche o lluvia moderada (`night_rain`): accuracy >= 90.0%
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence

import cv2

from src.detector.yolo_detector import FramePreprocessor, YoloVehicleDetector
from src.models import SlotState
from src.polygon_mapper.iou_evaluator import PolygonIoUEvaluator
from src.state_machine.temporal_fsm import SlotTemporalStateMachine

CLASSES: tuple[str, ...] = (
    SlotState.LIBRE.value,
    SlotState.OCUPADO.value,
    SlotState.EN_MANIOBRA.value,
)
DAY_ACCURACY_THRESHOLD = 0.95
NIGHT_RAIN_ACCURACY_THRESHOLD = 0.90


@dataclass(frozen=True)
class ClassMetrics:
    label: str
    support: int
    precision: float
    recall: float
    f1: float


@dataclass(frozen=True)
class ScenarioEvaluationReport:
    scenario: str
    total_samples: int
    correct: int
    accuracy: float
    threshold: float
    passed: bool
    confusion_matrix: List[List[int]]
    per_class: List[ClassMetrics]
    macro_f1: float
    weighted_f1: float


@dataclass(frozen=True)
class FullAccuracyReport:
    generated_at: str
    dataset_name: str
    dataset_mode: str
    overall: ScenarioEvaluationReport
    scenarios: Dict[str, ScenarioEvaluationReport]
    all_thresholds_passed: bool


def _compute_metrics(
    scenario: str,
    y_true: Sequence[str],
    y_pred: Sequence[str],
    threshold: float,
) -> ScenarioEvaluationReport:
    label_to_idx = {label: idx for idx, label in enumerate(CLASSES)}
    matrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    correct = 0

    for truth, pred in zip(y_true, y_pred):
        ti = label_to_idx[truth]
        pi = label_to_idx[pred]
        matrix[ti][pi] += 1
        if ti == pi:
            correct += 1

    total = len(y_true)
    accuracy = round(correct / total, 6) if total > 0 else 0.0

    per_class: List[ClassMetrics] = []
    f1_sum = 0.0
    weighted_f1_sum = 0.0

    for idx, label in enumerate(CLASSES):
        tp = matrix[idx][idx]
        fp = sum(matrix[r][idx] for r in range(3) if r != idx)
        fn = sum(matrix[idx][c] for c in range(3) if c != idx)
        support = sum(matrix[idx])

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

        per_class.append(
            ClassMetrics(
                label=label,
                support=support,
                precision=round(precision, 4),
                recall=round(recall, 4),
                f1=round(f1, 4),
            )
        )
        f1_sum += f1
        weighted_f1_sum += f1 * support

    macro_f1 = round(f1_sum / len(CLASSES), 4)
    weighted_f1 = round(weighted_f1_sum / total, 4) if total > 0 else 0.0

    return ScenarioEvaluationReport(
        scenario=scenario,
        total_samples=total,
        correct=correct,
        accuracy=accuracy,
        threshold=threshold,
        passed=accuracy >= threshold,
        confusion_matrix=matrix,
        per_class=per_class,
        macro_f1=macro_f1,
        weighted_f1=weighted_f1,
    )


class AccuracyEvaluator:
    """Ejecuta validación cuantitativa de precisión RNF-07 y exporta reportes."""

    def __init__(
        self,
        *,
        detector: Optional[YoloVehicleDetector] = None,
        preprocessor: Optional[FramePreprocessor] = None,
    ) -> None:
        self.detector = detector or YoloVehicleDetector(confidence_threshold=0.45)
        self.preprocessor = preprocessor or FramePreprocessor(mode="auto")

    def _predict_sample(
        self,
        sample: Mapping[str, Any],
        dataset_root: Path,
    ) -> str:
        vertices = [tuple(map(float, pt)) for pt in sample["polygon_vertices"]]
        fsm = SlotTemporalStateMachine(
            polygon_id=str(sample["spot_id"]),
            slot_name=str(sample.get("slot_name", sample["spot_id"])),
            iou_free_threshold=float(sample.get("iou_free_threshold", 0.20)),
            iou_occupied_threshold=float(sample.get("iou_occupied_threshold", 0.50)),
            t_free_seconds=float(sample.get("t_free_seconds", 2.0)),
            t_occupied_seconds=float(sample.get("t_occupied_seconds", 3.0)),
            min_occupied_frames=int(sample.get("min_occupied_frames", 2)),
            min_free_frames=int(sample.get("min_free_frames", 2)),
        )

        # Si el dataset apunta a capturas reales del campus, ejecuta YOLO + preprocesamiento en RAM
        if sample.get("image_path"):
            img_path = (dataset_root / str(sample["image_path"])).resolve()
            frame = cv2.imread(str(img_path))
            if frame is None:
                raise FileNotFoundError(f"No se pudo leer la imagen de validación: {img_path}")
            enhanced = self.preprocessor.process(frame)
            detections = self.detector.detect(enhanced)
            overlap = PolygonIoUEvaluator.evaluate_spot(vertices, detections)
            # Evaluar confirmación temporal sobre la detección del frame
            fsm.evaluate(overlap.iou_ratio, 0.0)
            final_state = fsm.evaluate(overlap.iou_ratio, 3.5)
            return final_state.value

        frames_seq = sample.get("frames") or [
            {"timestamp_sec": 0.0, "detections": sample.get("detections", [])}
        ]
        final_state = fsm.current_state
        for step in frames_seq:
            detections = self.detector.filter_raw_detections(step.get("detections", []))
            overlap = PolygonIoUEvaluator.evaluate_spot(vertices, detections)
            final_state = fsm.evaluate(overlap.iou_ratio, float(step.get("timestamp_sec", 0.0)))
        return final_state.value

    def evaluate_dataset(self, dataset_path: Path) -> FullAccuracyReport:
        """Carga `ground_truth.json`, ejecuta el pipeline y calcula matrices de confusión."""
        with dataset_path.open("r", encoding="utf-8") as fh:
            dataset = json.load(fh)

        samples: List[dict[str, Any]] = dataset["samples"]
        dataset_root = dataset_path.parent

        truth_by_scenario: Dict[str, List[str]] = {"day": [], "night_rain": []}
        pred_by_scenario: Dict[str, List[str]] = {"day": [], "night_rain": []}
        all_truth: List[str] = []
        all_pred: List[str] = []

        for sample in samples:
            scenario = str(sample["scenario"])
            truth = str(sample["ground_truth"])
            pred = self._predict_sample(sample, dataset_root)

            truth_by_scenario.setdefault(scenario, []).append(truth)
            pred_by_scenario.setdefault(scenario, []).append(pred)
            all_truth.append(truth)
            all_pred.append(pred)

        day_report = _compute_metrics(
            "day",
            truth_by_scenario.get("day", []),
            pred_by_scenario.get("day", []),
            DAY_ACCURACY_THRESHOLD,
        )
        night_report = _compute_metrics(
            "night_rain",
            truth_by_scenario.get("night_rain", []),
            pred_by_scenario.get("night_rain", []),
            NIGHT_RAIN_ACCURACY_THRESHOLD,
        )
        overall_report = _compute_metrics(
            "overall",
            all_truth,
            all_pred,
            NIGHT_RAIN_ACCURACY_THRESHOLD,
        )

        return FullAccuracyReport(
            generated_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            dataset_name=str(dataset.get("dataset_name", dataset_path.name)),
            dataset_mode=str(dataset.get("mode", "structured_mock")),
            overall=overall_report,
            scenarios={"day": day_report, "night_rain": night_report},
            all_thresholds_passed=day_report.passed and night_report.passed,
        )


def _scenario_to_dict(report: ScenarioEvaluationReport) -> dict[str, Any]:
    return {
        "scenario": report.scenario,
        "total_samples": report.total_samples,
        "correct": report.correct,
        "accuracy": report.accuracy,
        "accuracy_pct": round(report.accuracy * 100.0, 2),
        "threshold_pct": round(report.threshold * 100.0, 2),
        "passed": report.passed,
        "macro_f1": report.macro_f1,
        "weighted_f1": report.weighted_f1,
        "labels": list(CLASSES),
        "confusion_matrix": report.confusion_matrix,
        "per_class": [
            {
                "label": c.label,
                "support": c.support,
                "precision": c.precision,
                "recall": c.recall,
                "f1": c.f1,
            }
            for c in report.per_class
        ],
    }


def export_reports(report: FullAccuracyReport, output_dir: Path) -> Dict[str, Path]:
    """Exporta JSON, Markdown y PNG (si matplotlib está disponible) en `output_dir`."""
    output_dir.mkdir(parents=True, exist_ok=True)
    exported: Dict[str, Path] = {}

    json_path = output_dir / "rnf07_accuracy_report.json"
    json_data = {
        "generated_at": report.generated_at,
        "dataset_name": report.dataset_name,
        "dataset_mode": report.dataset_mode,
        "all_thresholds_passed": report.all_thresholds_passed,
        "overall": _scenario_to_dict(report.overall),
        "scenarios": {
            key: _scenario_to_dict(val) for key, val in report.scenarios.items()
        },
    }
    json_path.write_text(json.dumps(json_data, indent=2, ensure_ascii=False), encoding="utf-8")
    exported["json"] = json_path

    md_path = output_dir / "rnf07_accuracy_report.md"
    md_path.write_text(render_markdown_report(report), encoding="utf-8")
    exported["markdown"] = md_path

    png_path = output_dir / "rnf07_confusion_matrix.png"
    if _render_confusion_matrix_png(report, png_path):
        exported["png"] = png_path

    return exported


def render_markdown_report(report: FullAccuracyReport) -> str:
    lines: List[str] = [
        "# ParkFlow — Reporte de Validación de Precisión IA (`RNF-07`)",
        "",
        f"- **Generado:** `{report.generated_at}`",
        f"- **Dataset:** `{report.dataset_name}` (`{report.dataset_mode}`)",
        f"- **Resultado Global RNF-07:** `{'PASS' if report.all_thresholds_passed else 'FAIL'}`",
        "",
        "## Resumen por Escenario",
        "",
        "| Escenario | Muestras | Aciertos | Accuracy | Umbral ERS | Macro-F1 | Weighted-F1 | Estado |",
        "| :--- | ---: | ---: | ---: | ---: | ---: | ---: | :---: |",
    ]
    for sc_key in ("day", "night_rain"):
        sc = report.scenarios[sc_key]
        status = "PASS" if sc.passed else "FAIL"
        lines.append(
            f"| `{sc.scenario}` | {sc.total_samples} | {sc.correct} | "
            f"{sc.accuracy * 100:.2f}% | >= {sc.threshold * 100:.0f}% | "
            f"{sc.macro_f1:.4f} | {sc.weighted_f1:.4f} | **{status}** |"
        )
    ov = report.overall
    lines.append(
        f"| `overall` | {ov.total_samples} | {ov.correct} | "
        f"{ov.accuracy * 100:.2f}% | N/A | {ov.macro_f1:.4f} | {ov.weighted_f1:.4f} | INFO |"
    )

    for sc_key in ("day", "night_rain"):
        sc = report.scenarios[sc_key]
        lines.extend(
            [
                "",
                f"## Matriz de Confusión — `{sc.scenario}` ({sc.accuracy * 100:.2f}%)",
                "",
                "| Real \\ Predicho | Libre | Ocupado | En maniobra |",
                "| :--- | ---: | ---: | ---: |",
            ]
        )
        for label, row in zip(CLASSES, sc.confusion_matrix):
            lines.append(f"| **{label}** | {row[0]} | {row[1]} | {row[2]} |")
        lines.extend(
            [
                "",
                "| Clase | Soporte | Precision | Recall | F1-Score |",
                "| :--- | ---: | ---: | ---: | ---: |",
            ]
        )
        for cm in sc.per_class:
            lines.append(
                f"| `{cm.label}` | {cm.support} | {cm.precision:.4f} | {cm.recall:.4f} | {cm.f1:.4f} |"
            )

    lines.append("")
    return "\n".join(lines)


def _render_confusion_matrix_png(report: FullAccuracyReport, output_path: Path) -> bool:
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return False

    fig, axes = plt.subplots(1, 2, figsize=(11, 4.6), dpi=140)
    titles = {
        "day": f"Luz Diurna (day)\nAcc: {report.scenarios['day'].accuracy * 100:.2f}% (>= 95%)",
        "night_rain": (
            f"Noche / Lluvia Moderada (night_rain)\n"
            f"Acc: {report.scenarios['night_rain'].accuracy * 100:.2f}% (>= 90%)"
        ),
    }

    for ax, key in zip(axes, ("day", "night_rain")):
        sc = report.scenarios[key]
        matrix = sc.confusion_matrix
        im = ax.imshow(matrix, cmap="Blues", aspect="auto")
        ax.set_title(titles[key], fontsize=10, fontweight="bold")
        ax.set_xticks(range(len(CLASSES)))
        ax.set_yticks(range(len(CLASSES)))
        ax.set_xticklabels(CLASSES, rotation=15, ha="right", fontsize=8.5)
        ax.set_yticklabels(CLASSES, fontsize=8.5)
        ax.set_xlabel("Predicho")
        ax.set_ylabel("Real (Ground Truth)")

        max_val = max((max(r) for r in matrix), default=1)
        for r_idx in range(len(CLASSES)):
            for c_idx in range(len(CLASSES)):
                val = matrix[r_idx][c_idx]
                color = "white" if val > max_val * 0.55 else "#111827"
                ax.text(c_idx, r_idx, str(val), ha="center", va="center", color=color, fontweight="bold")
        fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)

    fig.suptitle("ParkFlow RNF-07 — Matrices de Confusión por Escenario", fontsize=12, fontweight="bold")
    fig.tight_layout()
    fig.savefig(output_path, bbox_inches="tight")
    plt.close(fig)
    return True
